import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { Kysely, Migrator, sql, type Migration, type MigrationProvider } from 'kysely';

/**
 * Kysely's FileMigrationProvider imports `.js`/`.ts` and ignores `.sql`. This
 * one reads a directory in name order and executes each file whole.
 */
class SqlMigrationProvider implements MigrationProvider {

    constructor(private readonly folder: string) {}

    async getMigrations(): Promise<Record<string, Migration>> {
        const files = (await fs.readdir(this.folder))
            .filter((file) => file.endsWith('.sql'))
            .sort();

        const migrations: Record<string, Migration> = {};

        for (const file of files) {
            const text = await fs.readFile(path.join(this.folder, file), 'utf8');

            migrations[path.basename(file, '.sql')] = {
                up: async (db: Kysely<unknown>) => {
                    await sql.raw(text).execute(db);
                },
            };
        }

        return migrations;
    }
}

/**
 * One Postgres schema per service, migrated in dependency order. Each keeps
 * its own history (`<schema>.kysely_migration`), so a schema can move to its
 * own database with its migrations.
 */
export const SCHEMAS = ['foundations', 'identity', 'library', 'gatekeeper', 'catalog', 'data_connection'] as const;

// src/db (dev) → packages/server/migrations; dist/server/src/db (build) → dist/server/migrations.
const migrationsRoot = () => path.resolve(__dirname, '../../migrations');

export async function migrateAll(db: Kysely<unknown>): Promise<void> {
    for (const schema of SCHEMAS) {
        const migrator = new Migrator({
            db,
            provider:             new SqlMigrationProvider(path.join(migrationsRoot(), schema)),
            migrationTableSchema: schema,
        });

        const { error, results } = await migrator.migrateToLatest();

        for (const result of results ?? [])
            if (result.status === 'Success')
                console.log(`[${schema}] applied ${result.migrationName}`);
            else if (result.status === 'Error')
                console.error(`[${schema}] failed ${result.migrationName}`);

        if (error)
            throw error instanceof Error ? error : new Error(String(error));
    }
}

/** True when every migration file of every schema is recorded in that schema's kysely_migration table. */
async function isMigrated(db: Kysely<unknown>): Promise<boolean> {
    for (const schema of SCHEMAS) {
        const expected = Object.keys(await new SqlMigrationProvider(path.join(migrationsRoot(), schema)).getMigrations());

        try {
            const { rows } = await sql<{ name: string }>`select name from ${sql.id(schema, 'kysely_migration')}`.execute(db);
            const applied = new Set(rows.map((row) => row.name));

            if (expected.some((name) => !applied.has(name)))
                return false;
        }
        catch {
            return false;                               // the schema or its tracking table doesn't exist yet
        }
    }

    return true;
}

/**
 * Workers never migrate — the API does, on boot. A worker started alongside
 * it (docker-compose, a fresh deploy) waits here until it has, rather than
 * crashing on a missing table.
 */
export async function waitForMigrations(db: Kysely<unknown>, timeoutMs = 120_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (!(await isMigrated(db))) {
        if (Date.now() > deadline)
            throw new Error('Timed out waiting for database migrations — is the API running?');

        await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
}
