import { z } from 'zod';
import { defineSource, defineSync } from '../core/definition';
import { Credential } from './credential';

/** Everything about where and how to connect is the credential's; a Postgres source has no settings of its own yet. */
export const Config = z.object({});

/** Set → an incremental (append) sync: each run copies only rows above the previous run's max of this column. */
const IncrementalColumn = z.string().min(1).optional()
    .meta({ title: 'Incremental column', description: 'A column that only grows (updated_at, id). Leave empty to copy everything every run.' });

/** What a Postgres sync copies: one table, or the result of a query. */
export const SyncConfig = z.discriminatedUnion('kind', [
    z.object({
        kind:              z.literal('table').meta({ title: 'Table', description: 'Copies one table or view' }),
        schema:            z.string().min(1).default('public').meta({ title: 'Schema' }),
        table:             z.string().min(1).meta({ title: 'Table' }),
        incrementalColumn: IncrementalColumn,
    }),
    z.object({
        kind:              z.literal('query').meta({ title: 'SQL query', description: 'Copies the result of a read-only query' }),
        sql:               z.string().min(1).meta({ title: 'SQL', description: 'Runs on the source database, read-only' }),
        incrementalColumn: IncrementalColumn,
    }),
]);

export const Definition = defineSource({
    id:           'postgres',
    displayName:  'PostgreSQL',
    description:  'Copies tables or query results from a PostgreSQL database.',
    icon:         'postgres',
    capabilities: { explore: true },
    credential:   Credential,
    Config,
    sync: defineSync({
        Config:      SyncConfig,
        transaction: (config) => (config.incrementalColumn ? 'append' : 'snapshot'),
    }),
});
