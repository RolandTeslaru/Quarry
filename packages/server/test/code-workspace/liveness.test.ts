import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Principal } from '@/auth/principal';
import { CodeWorkspaceService } from '@/services/CodeWorkspace/code-workspace.service';
import { createWorkspace } from '../support/code-workspace-fixtures';
import { ForgeHarness } from '../support/forge-fixtures';

/**
 * Work on a Code Workspace that isn't a repository call — an IDE session, its
 * token, Git — needs the workspace live (@RequireLive, enforced by @SecurityGate):
 * Gatekeeper ranks a trashed workspace like any other, so the gate checks it.
 */
describe('a trashed workspace', () => {

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

    async function trashedWorkspace() {
        const workspace = await createWorkspace(harness, admin);

        await harness.library.trash(admin, workspace.rid);

        return workspace;
    }

    it("opens no session — 404 before the worker is ever asked", async () => {
        const { rid } = await trashedWorkspace();

        await expect(service.openSession(admin, rid)).rejects.toBeInstanceOf(NotFoundException);
        await expect(service.restartSession(admin, rid)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('mints no session token for it', async () => {
        const { rid } = await trashedWorkspace();

        await expect(service.getSessionCredentials(Principal.delegate(admin.userRid, 'test'), rid)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('serves no Git — neither a fetch nor a push', async () => {
        const { rid } = await trashedWorkspace();

        await expect(service.authorizeFetch(admin, rid)).rejects.toBeInstanceOf(NotFoundException);
        await expect(service.authorizePush(admin, rid)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('is the same 404 inside a trashed project', async () => {
        const { rid, projectRid } = await createWorkspace(harness, admin);

        await harness.library.trash(admin, projectRid);

        await expect(service.authorizeFetch(admin, rid)).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe('a live workspace', () => {

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

    it('mints a session token for a reader, as them', async () => {
        const { rid, projectRid } = await createWorkspace(harness, admin);
        const viewer = await harness.createUser('member');

        await harness.grant(admin, projectRid, viewer, 'viewer');

        const credentials = await service.getSessionCredentials(Principal.delegate(viewer.userRid, 'test'), rid);

        expect(credentials.token.split('.')).toHaveLength(3);
        expect(credentials.user.email).toContain(viewer.userRid);
    });

    it('lets a reader fetch but not push; hides it from an outsider', async () => {
        const { rid, projectRid } = await createWorkspace(harness, admin);
        const viewer = await harness.createUser('member');
        const outsider = await harness.createUser('member');

        await harness.grant(admin, projectRid, viewer, 'viewer');

        await expect(service.authorizeFetch(viewer, rid)).resolves.toBeTypeOf('string');
        await expect(service.authorizePush(viewer, rid)).rejects.toBeInstanceOf(ForbiddenException);
        await expect(service.authorizeFetch(outsider, rid)).rejects.toBeInstanceOf(NotFoundException);
        await expect(service.getSessionCredentials(Principal.delegate(outsider.userRid, 'test'), rid)).rejects.toBeInstanceOf(NotFoundException);
    });
});
