import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import axios, { type AxiosInstance } from 'axios';
import { SignJWT } from 'jose';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import { Catalog, CodeWorkspace, type Dataset, Forge, Foundations, type Gatekeeper, Identity, Library } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { destroyPool, useDatabaseLogin } from '@quarry/platform-kernel/db/pool';
import { LibraryService } from '@quarry/platform-kernel/services/Library/library.service';
import { GitRepos } from '@quarry/code-workspace-microservice/services/git/git-repos';
import { CodeWorkspaceRepository } from '@quarry/code-workspace-microservice/services/code-workspace/code-workspace.repository';
import { CodeWorkspaceMicroserviceModule } from '@quarry/code-workspace-microservice/microservice.module';

const run = promisify(execFile);

export const MAIN = Foundations.MAIN_BRANCH;

/**
 * The Code Workspaces service's modules in one Nest context, **on its own database login**, against the
 * test database and Redis — with the main server, Catalog and Forge running as processes
 * (test/support/global-setup.ts) for its microservice calls, as in production — plus what its tests need
 * around them. Users, projects, grants and trashing are the platform's to write: the fixtures write them
 * through the owner's connection; datasets through Catalog's HTTP API, recipes and builds through Forge's, as the user.
 */
export class CodeWorkspaceHarness {

    public readonly library: LibraryService;

    private constructor(
        private readonly app:   INestApplicationContext,
        private readonly owner: Kysely<unknown>,
    ) {
        this.library = app.get(LibraryService);
    }

    /** Get the Nest context's other services. */
    public get<T>(type: new (...args: never[]) => T): T {
        return this.app.get(type);
    }

    public static async start(): Promise<CodeWorkspaceHarness> {
        useDatabaseLogin({ url: requireEnv('CODE_WORKSPACE_DATABASE_URL'), userRole: 'code_workspace_user' });

        const owner = new Kysely<unknown>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: requireEnv('DATABASE_URL'), max: 2 }) }) });

        return new CodeWorkspaceHarness(await NestFactory.createApplicationContext(CodeWorkspaceMicroserviceModule, { logger: false }), owner);
    }

    public async stop(): Promise<void> {
        await this.app.close();
        await destroyPool();
        await this.owner.destroy();
    }

    /** A token for the user, signed as GoTrue's are — what a browser, or a session's git, sends. */
    public async getToken(principal: Principal.User): Promise<string> {
        return new SignJWT({})
            .setProtectedHeader({ alg: 'HS256' })
            .setSubject(Foundations.Rid.parse(principal.userRid).locator)
            .setAudience('authenticated')
            .setExpirationTime('1h')
            .sign(new TextEncoder().encode(requireEnv('GOTRUE_JWT_SECRET')));
    }

    /** The main server's or a service's HTTP API, as the user. */
    public async getApi(principal: Principal.User, baseURL = requireEnv('QUARRY_SERVER_URL')): Promise<AxiosInstance> {
        return axios.create({ baseURL, headers: { authorization: `Bearer ${await this.getToken(principal)}` } });
    }

    /** Forge's ForgeAgent API, with the agent token — to play an agent. */
    public getAgentApi(): AxiosInstance {
        return axios.create({ baseURL: requireEnv('FORGE_URL'), headers: { authorization: `Bearer ${requireEnv('FORGE_AGENT_TOKEN')}` } });
    }

    /** A workspace member (an admin by default: owner of everything), inserted directly. */
    public async createUser(workspaceRole: Identity.User.WorkspaceRole = 'admin'): Promise<Principal.User> {
        const userRid = Identity.User.fromAuthId(randomUUID());

        await sql`
            insert into identity."user" (rid, email, display_name, workspace_role)
            values (${userRid}, ${`${userRid}@test.quarry`}, 'Test user', ${workspaceRole})`.execute(this.owner);

        return { type: 'user', userRid, workspaceRole };
    }

    /**
     * A project with a dataset per name — the project the Library's, in the main server: the owner writes it
     * here; the datasets Catalog's HTTP API. Datasets named in `withData` get one committed version (a
     * one-row CSV), so builds may use them as inputs.
     */
    public async createDatasets(
        principal: Principal.User,
        names:     string[],
        withData:  string[] = [],
    ): Promise<{ projectRid: Dataset['parentRid']; datasets: Record<string, Dataset.Rid> }> {
        const projectRid = Library.Project.createRid();
        const datasets: Record<string, Dataset.Rid> = {};
        const catalog = await this.getApi(principal, requireEnv('CATALOG_URL'));

        await sql`
            insert into library.resource (rid, type, name, created_by)
            values (${projectRid}, 'project', ${`Test ${randomUUID()}`}, ${principal.userRid})`.execute(this.owner);

        for (const name of names) {
            const { dataset } = await Catalog.API.Dataset.create(catalog, { parentRid: projectRid, name, description: null });

            datasets[name] = dataset.rid;

            if (withData.includes(name))
                await Catalog.API.Dataset.upload(catalog, dataset.rid, { mode: 'snapshot' }, new Blob(['n\n1\n']), 'part-0.csv');
        }

        return { projectRid, datasets };
    }

    /** Gives a member a role on a resource (and everything under it), as `granter` — granting is the main server's; the owner writes it here. */
    public async grant(granter: Principal.User, resourceRid: Library.Resource.Rid, member: Principal.User, role: Gatekeeper.Role.Name): Promise<void> {
        await sql`
            insert into gatekeeper.role_grant (resource_rid, user_rid, role, granted_by)
            values (${resourceRid}, ${member.userRid}, ${role}, ${granter.userRid})`.execute(this.owner);
    }

    /** Trashes a resource whatever its type — the Library app's, in the main server; the owner writes it here. */
    public async trash(principal: Principal.User, rid: Library.Resource.Rid): Promise<void> {
        await sql`update library.resource set trashed_at = now(), trashed_by = ${principal.userRid} where rid = ${rid}`.execute(this.owner);
    }

    /** What computes the dataset on main — Forge's HTTP API, as the user; null if nothing does. */
    public async getCurrentRecipe(principal: Principal.User, datasetRid: Dataset.Rid): Promise<Forge.Recipe | null> {
        const { recipe } = await Forge.API.getCurrentRecipe(await this.getApi(principal, requireEnv('FORGE_URL')), { datasetRid, branch: MAIN });

        return recipe;
    }

    /** A manual build of these datasets on main — Forge's HTTP API, as the user. */
    public async build(principal: Principal.User, datasetRids: Dataset.Rid[]): Promise<Forge.API.CreateBuild.Response> {
        return Forge.API.createBuild(await this.getApi(principal, requireEnv('FORGE_URL')), {
            branch:           MAIN,
            fallbackBranches: [],
            target:           { type: 'manual', datasetRids },
        });
    }

    /** Claims a job's attempt, as a ForgeAgent would. */
    public async claimJob(job: Pick<Forge.Job, 'rid' | 'attempt'>): Promise<Forge.API.Agent.Claim.Response> {
        return Forge.API.Agent.claim(this.getAgentApi(), job.rid, { attempt: job.attempt });
    }

    /** A dataset's current version on main — Catalog's HTTP API, as the user. */
    public async view(principal: Principal.User, datasetRid: Dataset.Rid): Promise<Dataset.View> {
        const { view } = await Catalog.API.Dataset.getView(await this.getApi(principal, requireEnv('CATALOG_URL')), datasetRid);

        return view;
    }

    /** Empties a queue's outbox — the service only relays and acks its messages; the owner deletes them here. */
    public async clearOutbox(queueName: string): Promise<void> {
        await sql`delete from foundations.outbox where queue_name = ${queueName}`.execute(this.owner);
    }

    /** The status of a Catalog transaction (this service can't read them; the test can). */
    public async transactionStatus(rid: Catalog.Transaction.Rid): Promise<string | undefined> {
        const { rows } = await sql<{ status: string }>`select status from catalog.transaction where rid = ${rid}`.execute(this.owner);

        return rows[0]?.status;
    }
}

/** The template's quarry-ci.yml, minus its environment steps: what a passing check runs. */
export const QUARRY_CI = `steps:
  - name: Tests
    run: pytest -q
  - name: Publish transforms
    uses: quarry/publish-transforms
`;

export interface TestWorkspace {
    readonly rid:        CodeWorkspace.Rid;
    readonly projectRid: CodeWorkspace['parentRid'];
    readonly heads:      CodeWorkspace.Git.Heads;
}

/**
 * A workspace in a new project, without a template (no `uv lock`): its row, and a
 * bare repository (under the test Git root) whose main holds one commit of `files`.
 * No check run is queued.
 */
export async function createWorkspace(
    harness:   CodeWorkspaceHarness,
    principal: Principal.User,
    files:     Record<string, string> = { 'README.md': '# Test\n' },
): Promise<TestWorkspace> {
    const { projectRid } = await harness.createDatasets(principal, []);
    const rid = CodeWorkspace.createRid();
    const gitRepos = harness.get(GitRepos);

    await gitRepos.create(rid, {
        author:   { name: 'Test', email: 'test@test.quarry' },
        message:  'Initial commit',
        populate: (directory) => writeFiles(directory, files),
    });

    await harness.get(CodeWorkspaceRepository).create(principal, {
        rid,
        name:        `Workspace ${rid.slice(-8)}`,
        description: null,
        parentRid:   projectRid,
        templateId:  'python-transforms',
    });

    return { rid, projectRid, heads: await gitRepos.getHeads(rid) };
}

/**
 * A commit of `files` on `branch` (from main if it's new), pushed straight to the bare
 * repository — not through the server, so no check is queued. The new commit.
 */
export async function commitFiles(
    harness: CodeWorkspaceHarness,
    rid:     CodeWorkspace.Rid,
    files:   Record<string, string>,
    branch:  Foundations.Branch = MAIN,
): Promise<CodeWorkspace.Git.Commit> {
    const repository = harness.get(GitRepos).getPath(rid);
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'quarry-test-commit-'));
    const git = (...args: string[]) => run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@test.quarry', '-C', directory, ...args])
        .then(({ stdout }) => stdout.trim());

    try {
        await run('git', ['clone', '--quiet', repository, directory]);

        const exists = await git('ls-remote', '--heads', 'origin', branch);

        await git('checkout', '--quiet', '-B', branch, exists ? `origin/${branch}` : 'origin/main');
        await writeFiles(directory, files);
        await git('add', '--all');
        await git('commit', '--quiet', '--allow-empty', '--message', `Change ${Object.keys(files).join(', ') || 'nothing'}`);
        await git('push', '--quiet', 'origin', `HEAD:refs/heads/${branch}`);

        return CodeWorkspace.Git.Commit.parse(await git('rev-parse', 'HEAD'));
    }
    finally {
        await fs.rm(directory, { recursive: true, force: true });
    }
}

async function writeFiles(directory: string, files: Record<string, string>): Promise<void> {
    for (const [file, contents] of Object.entries(files)) {
        await fs.mkdir(path.dirname(path.join(directory, file)), { recursive: true });
        await fs.writeFile(path.join(directory, file), contents);
    }
}

function requireEnv(name: string): string {
    const value = process.env[name];

    if (!value)
        throw new Error(`${name} is not set — tests need test/support/env.ts`);

    return value;
}
