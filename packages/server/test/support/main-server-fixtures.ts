import { randomUUID } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { sql } from 'kysely';
import { Identity } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-server/auth/principal';
import { ApiModule } from '@/api.module';
import { db, destroyPool } from '@quarry/platform-server/db/pool';

/** The main server's modules in one Nest context, against the test database and Redis (test/support/env.ts). */
export class MainServerHarness {

    private constructor(private readonly app: INestApplicationContext) {}

    public static async start(): Promise<MainServerHarness> {
        return new MainServerHarness(await NestFactory.createApplicationContext(ApiModule, { logger: false }));
    }

    public async stop(): Promise<void> {
        await this.app.close();
        await destroyPool();
    }

    public get<T>(type: new (...args: never[]) => T): T {
        return this.app.get(type);
    }

    /** A workspace member, inserted directly. */
    public async createUser(workspaceRole: Identity.User.WorkspaceRole = 'admin'): Promise<Principal.User> {
        const userRid = Identity.User.fromAuthId(randomUUID());

        await sql`
            insert into identity."user" (rid, email, display_name, workspace_role)
            values (${userRid}, ${`${userRid}@test.quarry`}, 'Test user', ${workspaceRole})`.execute(db());

        return { type: 'user', userRid, workspaceRole };
    }
}
