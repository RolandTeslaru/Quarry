import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { CodeWorkspace, Library, type Catalog, type Identity, type Platform } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { Principal } from '@/auth/principal';
import { RequireUserPrincipal } from '@/auth/require-user-principal';
import { SessionTokens } from '@/auth/session-tokens';
import { GatekeeperService } from '@/services/Gatekeeper/gatekeeper.service';
import { RequireLive } from '@/db/liveness';
import { SecurityGate } from '@/services/Gatekeeper/security-gate';
import { IdentityService } from '@/services/Identity/identity.service';
import { LibraryService } from '@/services/Library/library.service';
import { CodeWorkspaceRepository } from './repository/code-workspace.repository';
import { CIService } from './ci/ci.service';
import { GitRepos } from './git/git-repos';
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
        private readonly gitRepos:        GitRepos,
        private readonly repository:      CodeWorkspaceRepository,
        private readonly worker:          CodeWorkspaceWorkerClient,
        private readonly sessionTokens:   SessionTokens,
        public readonly ci:               CIService,
    ) {}

    getTemplates(): Record<CodeWorkspace.Template.Id, CodeWorkspace.Template.Schema> {
        return TEMPLATES_WIRE;
    }

    getTemplate(id: CodeWorkspace.Template.Id): WorkspaceTemplate {
        const template = TEMPLATES[id];

        if (!template)
            throw new BadRequestException(`Unknown template '${id}'`);

        return template;
    }

    async list(principal: Principal): Promise<CodeWorkspace.Schema[]> {
        return this.repository.workspace.list(principal);
    }

    async create(principal: Principal.User, request: CodeWorkspace.API.Create.Request): Promise<CodeWorkspace.Schema> {
        const template = this.getTemplate(request.templateId);

        await this.gatekeeper.assert(principal, 'write', request.parentRid);

        const params = await this.getTemplateParams(principal, request);
        const author = await this.identity.me(principal);
        const rid = CodeWorkspace.createRid();

        await this.gitRepos.create(rid, {
            author:   { name: author.displayName, email: author.email },
            message:  `Create ${request.name} from the ${template.displayName} template`,
            populate: directory => render(template, params, directory),
        });

        try {
            const workspace = await this.repository.workspace.create(principal, {
                rid,
                name:        request.name,
                description: request.description,
                parentRid:   request.parentRid,
                templateId:  template.id,
            });

            this.log.info(`Created ${rid} from ${template.id}`);

            await this.ci.queueChecksForPush(principal, rid, {});

            return workspace;
        }
        catch (error) {
            await this.gitRepos.remove(rid);

            throw error;
        }
    }

    async get(principal: Principal, rid: CodeWorkspace.Rid): Promise<CodeWorkspace.Schema> {
        const workspace = await this.repository.workspace.get(principal, rid);

        if (!workspace)
            throw new NotFoundException('Not found');

        return workspace;
    }

    @RequireUserPrincipal('Only users open pages')
    async open(principal: Principal.User, rid: CodeWorkspace.Rid, application: Platform.Application.Id): Promise<CodeWorkspace.Schema> {
        const workspace = await this.repository.workspace.open(principal, rid, application);

        if (!workspace)
            throw new NotFoundException('Not found');

        return workspace;
    }

    @RequireUserPrincipal('Only users have sessions')
    @SecurityGate('read')
    async openSession(principal: Principal.User, @RequireLive() rid: CodeWorkspace.Rid): Promise<string> {
        return this.worker.openSession(rid, principal.userRid);
    }

    @RequireUserPrincipal('Only users have sessions')
    @SecurityGate('read')
    async restartSession(principal: Principal.User, @RequireLive() rid: CodeWorkspace.Rid): Promise<string> {
        return this.worker.restartSession(rid, principal.userRid);
    }

    @SecurityGate('read')
    async getSessionCredentials(principal: Principal.Delegate, @RequireLive() workspaceRid: CodeWorkspace.Rid): Promise<CodeWorkspace.API.Internal.SessionCredentials.Response> {
        const user = await this.identity.getUser(principal, principal.userRid);

        return {
            token: await this.sessionTokens.mint(principal.userRid, principal.via),
            user:  { name: user.displayName, email: user.email },
        };
    }

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

async function render(template: WorkspaceTemplate, params: TemplateParams, directory: string): Promise<void> {
    for (const [file, contents] of Object.entries(template.files(params))) {
        const target = path.join(directory, file);

        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, contents);
    }

    await template.prepare?.(directory);
}
