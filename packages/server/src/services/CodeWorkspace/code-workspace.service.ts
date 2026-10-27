import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { CodeWorkspace, Library, type Catalog, type Platform } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { Principal } from '@/auth/principal';
import { RequireUserPrincipal } from '@/auth/require-user-principal';
import { SessionTokens } from '@/auth/session-tokens';
import { GatekeeperService } from '@/services/Gatekeeper/gatekeeper.service';
import { SecurityGate } from '@/services/Gatekeeper/security-gate';
import { IdentityService } from '@/services/Identity/identity.service';
import { LibraryService } from '@/services/Library/library.service';
import { CodeWorkspaceRepository } from './code-workspace.repository';
import { CodeWorkspaceChecks, getMovedHeads } from './checks/code-workspace-checks';
import { GitRepositories, type Heads } from './git/repositories';
import { CodeWorkspaceWorkerClient } from './worker/code-workspace-worker.client';
import { TEMPLATES, TEMPLATES_WIRE, type TemplateParams, type WorkspaceTemplate } from './templates';

/**
 * Code Workspaces — library resources, each a bare Git repository of
 * transforms (docs/design/transforms.md).
 *
 *   discover  see it exists
 *   read      open it (a session — previews run in it), clone it
 *   write     push to it
 *   manage    share it (Gatekeeper grants)
 *
 * Rows are RLS's. Creating one builds its repository (the rendered template,
 * locked) before the row, so write on the parent is asserted first.
 */
@Injectable()
export class CodeWorkspaceService {

    private readonly log = System.log.withContext('CodeWorkspace');

    constructor(
        readonly gatekeeper:              GatekeeperService,
        private readonly identity:        IdentityService,
        private readonly library:         LibraryService,
        private readonly gitRepositories: GitRepositories,
        private readonly repository:      CodeWorkspaceRepository,
        private readonly worker:          CodeWorkspaceWorkerClient,
        private readonly sessionTokens:   SessionTokens,
        public readonly checks:           CodeWorkspaceChecks,
    ) {}

    /** Every template the deployment declares. */
    getTemplates(): Record<CodeWorkspace.Template.Id, CodeWorkspace.Template.Schema> {
        return TEMPLATES_WIRE;
    }

    /** One template, with its files — 400 if the deployment declares no such id. */
    getTemplate(id: CodeWorkspace.Template.Id): WorkspaceTemplate {
        const template = TEMPLATES[id];

        if (!template)
            throw new BadRequestException(`Unknown template '${id}'`);

        return template;
    }

    /** Workspaces the principal can discover (RLS), across projects. */
    async list(principal: Principal): Promise<CodeWorkspace.Schema[]> {
        return this.repository.list(principal);
    }

    /**
     * Write on the parent, then the repository — the template rendered, locked
     * and committed as the creating user — then the row. A failed row removes
     * the repository again.
     */
    async create(principal: Principal.User, request: CodeWorkspace.API.Create.Request): Promise<CodeWorkspace.Schema> {
        const template = this.getTemplate(request.templateId);

        await this.gatekeeper.assert(principal, 'write', request.parentRid);

        const params = await this.getTemplateParams(principal, request);
        const author = await this.identity.me(principal);
        const rid = CodeWorkspace.createRid();

        await this.gitRepositories.create(rid, {
            author:   { name: author.displayName, email: author.email },
            message:  `Create ${request.name} from the ${template.displayName} template`,
            populate: directory => render(template, params, directory),
        });

        try {
            const workspace = await this.repository.create(principal, {
                rid,
                name:        request.name,
                description: request.description,
                parentRid:   request.parentRid,
                templateId:  template.id,
            });

            this.log.info(`Created ${rid} from ${template.id}`);

            await this.pushed(principal, rid, {});                  // the template's commit: checked like any push

            return workspace;
        }
        catch (error) {
            await this.gitRepositories.remove(rid);

            throw error;
        }
    }

    async get(principal: Principal, rid: CodeWorkspace.Rid): Promise<CodeWorkspace.Schema> {
        const workspace = await this.repository.get(principal, rid);

        if (!workspace)
            throw new NotFoundException('Not found');

        return workspace;
    }

    /** An app opening the workspace's page — the open recorded with the read (audit). Only users open pages. */
    @RequireUserPrincipal('Only users open pages')
    async open(principal: Principal.User, rid: CodeWorkspace.Rid, application: Platform.Application.Id): Promise<CodeWorkspace.Schema> {
        const workspace = await this.repository.open(principal, rid, application);

        if (!workspace)
            throw new NotFoundException('Not found');

        return workspace;
    }

    /**
     * The caller's session on the workspace — started by the code workspace worker, or
     * reused — and the URL its IDE is served at. Read on the workspace.
     */
    @RequireUserPrincipal('Only users have sessions')
    @SecurityGate('read')
    async openSession(principal: Principal.User, rid: CodeWorkspace.Rid): Promise<string> {
        await this.get(principal, rid);                     // 404 if it's gone or trashed

        return this.worker.openSession(rid, principal.userRid);
    }

    /**
     * The caller's session replaced by a fresh container from the current runtime image (its working copy
     * stays), and the URL its IDE is served at. Read on the workspace, as for opening it.
     */
    @RequireUserPrincipal('Only users have sessions')
    @SecurityGate('read')
    async restartSession(principal: Principal.User, rid: CodeWorkspace.Rid): Promise<string> {
        await this.get(principal, rid);                     // 404 if it's gone or trashed

        return this.worker.restartSession(rid, principal.userRid);
    }

    /**
     * For the code workspace worker, each time it acts for a session: the user must still
     * read the workspace — checked as them — then a token that acts as them.
     */
    async getSessionCredentials(request: CodeWorkspace.API.Internal.SessionCredentials.Request): Promise<CodeWorkspace.API.Internal.SessionCredentials.Response> {
        const via = `code-workspace-session:${request.workspaceRid}`;
        const principal = Principal.onBehalfOf(request.userRid, via);

        await this.get(principal, request.workspaceRid);
        await this.gatekeeper.assert(principal, 'read', request.workspaceRid);

        const user = await this.identity.getUser(principal, request.userRid);

        return {
            token: await this.sessionTokens.mint(request.userRid, via),
            user:  { name: user.displayName, email: user.email },
        };
    }

    /**
     * Git over HTTP: the workspace must be live and visible, then read to clone
     * or fetch, write to push. Returns where its bare repository is.
     */
    async authorizeGit(principal: Principal, rid: CodeWorkspace.Rid, operation: 'fetch' | 'push'): Promise<string> {
        await this.get(principal, rid);
        await this.gatekeeper.assert(principal, operation === 'push' ? 'write' : 'read', rid);

        return this.gitRepositories.root;
    }

    /** Where the workspace's branches point — read before a push, to see what it moved. */
    async getHeads(rid: CodeWorkspace.Rid): Promise<Heads> {
        return this.gitRepositories.getHeads(rid);
    }

    /**
     * After a push: a check run for every branch it created or moved, as the pusher.
     * Never throws — the push has already succeeded; a run that isn't queued is logged.
     */
    async pushed(principal: Principal.User, rid: CodeWorkspace.Rid, before: Heads): Promise<void> {
        try {
            const moved = getMovedHeads(before, await this.gitRepositories.getHeads(rid));

            if (Object.keys(moved).length > 0)
                await this.checks.pushed(principal, rid, moved);
        }
        catch (error) {
            this.log.error(`Couldn't queue checks for a push to ${rid}`, { error });
        }
    }

    /** Names from the workspace's; the example's paths from the library (the input must be visible to the user). */
    private async getTemplateParams(principal: Principal, request: CodeWorkspace.API.Create.Request): Promise<TemplateParams> {
        const example = request.exampleInputRid
            ? await this.getExamplePaths(principal, request.exampleInputRid, request.parentRid)
            : null;

        return {
            workspaceName: request.name,
            projectName:   CodeWorkspace.Template.getProjectName(request.name),
            packageName:   CodeWorkspace.Template.getPackageName(request.name),
            example,
        };
    }

    /** Reads the input; writes `<input name> (clean)` beside the workspace. */
    private async getExamplePaths(principal: Principal, inputRid: Catalog.Dataset.Rid, parentRid: Library.Resource.Rid) {
        const input = await this.library.path(principal, inputRid);
        const parent = await this.library.path(principal, parentRid);
        const inputName = input[input.length - 1]?.name ?? 'input';

        return {
            inputPath:  Library.Resource.getPath(input),
            outputPath: `${Library.Resource.getPath(parent)}/${inputName} (clean)`,
        };
    }
}

/** Writes the template's files, then runs its preparation (e.g. `uv lock`). */
async function render(template: WorkspaceTemplate, params: TemplateParams, directory: string): Promise<void> {
    for (const [file, contents] of Object.entries(template.files(params))) {
        const target = path.join(directory, file);

        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, contents);
    }

    await template.prepare?.(directory);
}
