import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CodeWorkspace, Foundations } from '@quarry/shared/domain';
import { ApiModule } from '@/api.module';
import type { Principal } from '@/auth/principal';
import { SessionTokens } from '@/auth/session-tokens';
import { db } from '@/db/pool';
import { CodeWorkspaceService } from '@/services/CodeWorkspace/code-workspace.service';
import { QUARRY_CI, commitFiles, createWorkspace } from '../support/code-workspace-fixtures';
import { ForgeHarness } from '../support/forge-fixtures';

const run = promisify(execFile);

const MAIN = Foundations.Branch.parse('main');
const FEATURE = Foundations.Branch.parse('feature/orders');

/**
 * Check runs queued by pushes (docs/design/code-workspaces/checks.md §1): one per
 * moved branch head, as the pusher, superseding the branch's unfinished runs — and,
 * one at a time per workspace, the next scheduled in the same transaction.
 * Workspaces are made without a template (no `uv lock`): the row, and a bare
 * repository under the test Git root whose commits hold a quarry-ci.yml.
 */
describe('check runs', () => {

    let harness: ForgeHarness;
    let service: CodeWorkspaceService;
    let admin: Principal.User;

    beforeAll(async () => {
        harness = await ForgeHarness.start();
        service = harness.get(CodeWorkspaceService);
        admin = await harness.createUser();
    });

    afterAll(async () => {
        await harness.stop();
    });

    /** A workspace whose commits can be checked (they hold quarry-ci.yml). */
    const checkedWorkspace = () => createWorkspace(harness, admin, { 'quarry-ci.yml': QUARRY_CI });

    async function getByCommit(rid: CodeWorkspace.Rid): Promise<Record<string, CodeWorkspace.CheckRun.Schema>> {
        return Object.fromEntries((await service.checks.listCheckRuns(admin, rid)).map((run) => [run.commit, run]));
    }

    describe('queued by the service', () => {

        it('queues a run per moved branch, as the pusher — scheduled at once in a free workspace', async () => {
            const { rid, heads } = await checkedWorkspace();

            await service.pushed(admin, rid, {});

            const runs = await service.checks.listCheckRuns(admin, rid);

            expect(runs).toHaveLength(1);
            expect(runs[0]).toMatchObject({ branch: MAIN, commit: heads[MAIN], status: 'scheduled', pushedBy: admin.userRid, published: false });
            expect(runs[0].steps.map((step) => step.name)).toEqual([CodeWorkspace.CheckRun.PARSE_STEP, 'Tests', 'Publish transforms', CodeWorkspace.CheckRun.PUBLISH_STEP]);
        });

        it('fails a head without a valid quarry-ci.yml at Parse, at once', async () => {
            const { rid } = await createWorkspace(harness, admin);                       // README only

            await service.pushed(admin, rid, {});

            expect(await service.checks.listCheckRuns(admin, rid)).toMatchObject([{ status: 'failed', failure: { step: CodeWorkspace.CheckRun.PARSE_STEP } }]);
        });

        it("queues nothing when the push moved nothing", async () => {
            const { rid, heads } = await checkedWorkspace();

            await service.pushed(admin, rid, heads);

            expect(await service.checks.listCheckRuns(admin, rid)).toEqual([]);
        });

        it("supersedes the branch's unfinished runs — freeing the workspace for its oldest waiting run", async () => {
            const { rid } = await checkedWorkspace();
            const a = await commitFiles(harness, rid, { 'a.py': '' });
            const f = await commitFiles(harness, rid, { 'f.py': '' }, FEATURE);

            await service.checks.pushed(admin, rid, { [MAIN]: a });                          // scheduled
            await service.checks.pushed(admin, rid, { [FEATURE]: f });                       // waiting: the workspace is busy
            await setRunning((await getByCommit(rid))[a].rid);

            const b = await commitFiles(harness, rid, { 'b.py': '' });
            const second = await service.checks.pushed(admin, rid, { [MAIN]: b });

            expect(second.canceled.map((run) => run.commit)).toEqual([a]);

            const byCommit = await getByCommit(rid);

            expect(byCommit[a]).toMatchObject({ status: 'canceled' });
            expect(byCommit[a].finishedAt).not.toBeNull();
            expect(byCommit[f]).toMatchObject({ status: 'scheduled' });                    // the oldest waiting, not the newest
            expect(byCommit[b]).toMatchObject({ status: 'waiting' });
        });

        it('leaves finished runs alone when superseding', async () => {
            const { rid } = await checkedWorkspace();
            const a = await commitFiles(harness, rid, { 'a.py': '' });

            await service.checks.pushed(admin, rid, { [MAIN]: a });
            await finish((await getByCommit(rid))[a].rid);

            const b = await commitFiles(harness, rid, { 'b.py': '' });
            const second = await service.checks.pushed(admin, rid, { [MAIN]: b });

            expect(second.canceled).toEqual([]);
            expect((await service.checks.listCheckRuns(admin, rid, MAIN)).map((run) => run.status)).toEqual(['scheduled', 'failed']);
        });

        it('lists one branch, newest first', async () => {
            const { rid } = await checkedWorkspace();
            const a = await commitFiles(harness, rid, { 'a.py': '' });
            const f = await commitFiles(harness, rid, { 'f.py': '' }, FEATURE);

            await service.checks.pushed(admin, rid, { [MAIN]: a, [FEATURE]: f });

            const b = await commitFiles(harness, rid, { 'b.py': '' });

            await service.checks.pushed(admin, rid, { [MAIN]: b });

            expect((await service.checks.listCheckRuns(admin, rid, MAIN)).map((run) => run.commit)).toEqual([b, a]);
            expect((await service.checks.listCheckRuns(admin, rid, FEATURE)).map((run) => run.commit)).toEqual([f]);
        });

        it('lets readers see runs; refuses queueing to someone without write', async () => {
            const { rid, projectRid } = await checkedWorkspace();
            const viewer = await harness.createUser('member');
            const outsider = await harness.createUser('member');
            const a = await commitFiles(harness, rid, { 'a.py': '' });
            const b = await commitFiles(harness, rid, { 'b.py': '' });

            await harness.grant(admin, projectRid, viewer, 'viewer');
            await service.checks.pushed(admin, rid, { [MAIN]: a });

            expect(await service.checks.listCheckRuns(viewer, rid)).toHaveLength(1);
            expect(await service.checks.listCheckRuns(outsider, rid)).toEqual([]);
            await expect(service.checks.pushed(viewer, rid, { [MAIN]: b })).rejects.toThrow();
            expect(await service.checks.listCheckRuns(admin, rid)).toHaveLength(1);
        });

        it('never throws from pushed: a failure to queue is logged, not raised into the finished push', async () => {
            const { rid, projectRid } = await checkedWorkspace();
            const viewer = await harness.createUser('member');

            await harness.grant(admin, projectRid, viewer, 'viewer');

            await expect(service.pushed(viewer, rid, {})).resolves.toBeUndefined();
            expect(await service.checks.listCheckRuns(admin, rid)).toEqual([]);
        });
    });

    describe('queued by a real push over HTTP', () => {

        let server: NestExpressApplication;
        let gitUrl: (rid: CodeWorkspace.Rid) => string;
        let clones: string;

        beforeAll(async () => {
            server = await NestFactory.create<NestExpressApplication>(ApiModule, { logger: false });
            server.setGlobalPrefix('api');
            server.useWebSocketAdapter(new WsAdapter(server));
            await server.listen(0, '127.0.0.1');

            const { port } = server.getHttpServer().address() as AddressInfo;

            gitUrl = (rid) => `http://127.0.0.1:${port}/api/git/${rid}.git`;
            clones = await fs.mkdtemp(path.join(os.tmpdir(), 'quarry-test-clones-'));
        });

        afterAll(async () => {
            await server?.close();
            if (clones)
                await fs.rm(clones, { recursive: true, force: true });
        });

        /** A clone of the workspace, git authenticated as the user — as a session's setup does it. */
        async function cloneAs(user: Principal.User, rid: CodeWorkspace.Rid): Promise<Git> {
            const token = await harness.get(SessionTokens).mint(user.userRid, 'test');
            const directory = await fs.mkdtemp(path.join(clones, 'clone-'));
            const git = (...args: string[]) => run('git', [
                '-c', `http.extraHeader=Authorization: Bearer ${token}`,
                '-c', 'user.name=Test', '-c', 'user.email=test@test.quarry',
                '-C', directory, ...args,
            ]).then(({ stdout }) => stdout.trim());

            await run('git', ['-c', `http.extraHeader=Authorization: Bearer ${token}`, 'clone', '--quiet', gitUrl(rid), directory]);

            return {
                directory,
                git,
                commit: async (file: string) => {
                    await fs.writeFile(path.join(directory, file), `${file} ${Math.random()}\n`);
                    await git('add', file);
                    await git('commit', '--quiet', '--message', `Change ${file}`);

                    return CodeWorkspace.Git.Commit.parse(await git('rev-parse', 'HEAD'));
                },
            };
        }

        it('queues a run for the pushed commit', async () => {
            const { rid } = await checkedWorkspace();
            const clone = await cloneAs(admin, rid);
            const commit = await clone.commit('orders.py');

            await clone.git('push', '--quiet', 'origin', 'main');

            const runs = await service.checks.listCheckRuns(admin, rid);

            expect(runs).toHaveLength(1);
            expect(runs[0]).toMatchObject({ branch: MAIN, commit, status: 'scheduled', pushedBy: admin.userRid });
        });

        it('checks only the head of a push of several commits', async () => {
            const { rid } = await checkedWorkspace();
            const clone = await cloneAs(admin, rid);

            await clone.commit('a.py');
            await clone.commit('b.py');
            const head = await clone.commit('c.py');

            await clone.git('push', '--quiet', 'origin', 'main');

            expect((await service.checks.listCheckRuns(admin, rid)).map((run) => run.commit)).toEqual([head]);
        });

        it('queues a run per branch pushed, and supersedes on the next push', async () => {
            const { rid } = await checkedWorkspace();
            const clone = await cloneAs(admin, rid);

            const first = await clone.commit('a.py');
            await clone.git('push', '--quiet', 'origin', 'main');
            await clone.git('checkout', '--quiet', '-b', FEATURE);
            const feature = await clone.commit('f.py');
            await clone.git('checkout', '--quiet', 'main');
            const second = await clone.commit('b.py');

            await clone.git('push', '--quiet', 'origin', 'main', FEATURE);

            const byCommit = Object.fromEntries((await service.checks.listCheckRuns(admin, rid)).map((run) => [run.commit, run]));

            expect(byCommit[first]).toMatchObject({ status: 'canceled' });
            expect(byCommit[second]).toMatchObject({ branch: MAIN });
            expect(byCommit[feature]).toMatchObject({ branch: FEATURE });
            expect([byCommit[second].status, byCommit[feature].status].sort()).toEqual(['scheduled', 'waiting']);   // one at a time per workspace
        });

        it('queues nothing for a rejected push, a fetch, or a deleted branch', async () => {
            const { rid } = await checkedWorkspace();
            const ahead = await cloneAs(admin, rid);
            const behind = await cloneAs(admin, rid);

            await ahead.commit('a.py');
            await ahead.git('push', '--quiet', 'origin', 'main');
            await ahead.git('push', '--quiet', 'origin', `main:${FEATURE}`);

            const before = (await service.checks.listCheckRuns(admin, rid)).length;

            await behind.commit('b.py');
            await expect(behind.git('push', '--quiet', 'origin', 'main')).rejects.toThrow();     // not a fast-forward
            await behind.git('fetch', '--quiet', 'origin');
            await ahead.git('push', '--quiet', 'origin', '--delete', FEATURE);

            expect(await service.checks.listCheckRuns(admin, rid)).toHaveLength(before);
        });

        it("refuses a viewer's push — and queues nothing", async () => {
            const { rid, projectRid } = await checkedWorkspace();
            const viewer = await harness.createUser('member');

            await harness.grant(admin, projectRid, viewer, 'viewer');

            const clone = await cloneAs(viewer, rid);                                          // read: may clone

            await clone.commit('a.py');
            await expect(clone.git('push', '--quiet', 'origin', 'main')).rejects.toThrow(/403/);
            expect(await service.checks.listCheckRuns(admin, rid)).toEqual([]);
        });

        it("queues an editor's push as the editor", async () => {
            const { rid, projectRid } = await checkedWorkspace();
            const editor = await harness.createUser('member');

            await harness.grant(admin, projectRid, editor, 'editor');

            const clone = await cloneAs(editor, rid);
            const commit = await clone.commit('a.py');

            await clone.git('push', '--quiet', 'origin', 'main');

            expect(await service.checks.listCheckRuns(admin, rid)).toMatchObject([{ commit, pushedBy: editor.userRid }]);
        });
    });
});

interface Git {
    readonly directory: string;
    readonly git:       (...args: string[]) => Promise<string>;
    /** Changes a file and commits it; the new commit. */
    readonly commit:    (file: string) => Promise<CodeWorkspace.Git.Commit>;
}

/** As the worker will, once it takes the run. */
async function setRunning(rid: CodeWorkspace.CheckRun.Rid): Promise<void> {
    await sql`update code_workspace.check_run set status = 'running', scheduled_at = now(), started_at = now(), reported_at = now() where rid = ${rid}`.execute(db());
}

async function finish(rid: CodeWorkspace.CheckRun.Rid): Promise<void> {
    await sql`
        update code_workspace.check_run
           set status = 'failed', started_at = now(), finished_at = now(),
               failure = ${JSON.stringify({ step: 'Tests', message: 'pytest failed' })}::jsonb
         where rid = ${rid}`.execute(db());
}
