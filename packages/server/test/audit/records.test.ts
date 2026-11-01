import { randomUUID } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Audit, Identity, Library } from '@quarry/shared/domain';
import { Principal } from '@quarry/platform-server/auth/principal';
import { ApiModule } from '@/api.module';
import { db, destroyPool } from '@quarry/platform-server/db/pool';
import { AuditRepository } from '@quarry/platform-server/services/Audit/audit.repository';
import { AuditService } from '@quarry/platform-server/services/Audit/audit.service';

/**
 * Audit records go through the outbox (docs/design/architecture-split.md §7): queued in the
 * transaction of the access, stored once by the main server, acked in the same transaction.
 */
describe('audit records', () => {

    let app: INestApplicationContext;
    let audit: AuditService;
    let repository: AuditRepository;
    let user: Principal.User;

    beforeAll(async () => {
        app = await NestFactory.createApplicationContext(ApiModule, { logger: false });
        audit = app.get(AuditService);
        repository = app.get(AuditRepository);

        const userRid = Identity.User.fromAuthId(randomUUID());

        await sql`insert into identity."user" (rid, email, display_name, workspace_role) values (${userRid}, ${`${userRid}@test.quarry`}, 'Test user', 'member')`.execute(db());
        user = { type: 'user', userRid, workspaceRole: 'member' };
    });

    afterAll(async () => {
        await app.close();
        await destroyPool();
    });

    const queued = async (resourceRid: string) => {
        const { rows } = await sql<{ job_id: string; payload: Audit.Queue.Record.Job }>`
            select job_id, payload from foundations.outbox
             where queue_name = ${Audit.Queue.Record.Definition.name} and payload->>'resourceRid' = ${resourceRid}`.execute(db());

        return rows;
    };

    const stored = async (resourceRid: string) => {
        const { rows } = await sql<{ action: string; user_rid: string; detail: unknown }>`
            select action, user_rid, detail from audit.access_event where resource_rid = ${resourceRid}`.execute(db());

        return rows;
    };

    it("queues a read in the outbox, not the table — for the user, with what was read", async () => {
        const rid = Library.Project.createRid();

        await audit.record(user, { resourceRid: rid, action: 'read', detail: { op: 'preview' } });

        const [message] = await queued(rid);

        expect(message.payload).toMatchObject({ userRid: user.userRid, via: null, resourceType: 'project', action: 'read', detail: { op: 'preview' } });
        expect(await stored(rid)).toEqual([]);
    });

    it('stores a record once however often it is delivered, and acks it', async () => {
        const rid = Library.Project.createRid();

        await audit.record(user, { resourceRid: rid, action: 'reveal' });

        const [message] = await queued(rid);
        const record = Audit.Queue.Record.Job.parse(message.payload);

        await repository.store(Principal.SELF('test'), message.job_id, record);
        await repository.store(Principal.SELF('test'), message.job_id, record);

        expect(await stored(rid)).toEqual([{ action: 'reveal', user_rid: user.userRid, detail: {} }]);
        expect(await queued(rid)).toEqual([]);
    });

    it('records nothing for the system acting on its own', async () => {
        const rid = Library.Project.createRid();

        await audit.record(Principal.SELF('test'), { resourceRid: rid, action: 'read' });

        expect(await queued(rid)).toEqual([]);
    });
});
