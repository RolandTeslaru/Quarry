import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { Kysely, Migrator, sql, type Migration, type MigrationProvider } from 'kysely';
import { System } from '@quarry/shared/server/system';

const log = System.log.withContext('Migrate');

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
export const SCHEMAS = ['foundations', 'identity', 'library', 'gatekeeper', 'keychain', 'catalog', 'data_connection'] as const;

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
                log.info('Applied migration', {
                    schema,
                    migration: result.migrationName,
                });
            else if (result.status === 'Error')
                log.error('Migration failed', {
                    schema,
                    migration: result.migrationName,
                });

        if (error)
            throw error instanceof Error ? error : new Error(String(error));
    }
}
