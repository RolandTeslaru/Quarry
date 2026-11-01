import type { DataConnection } from '@quarry/shared/domain';
import type { RuntimeClass } from './core/runtime';
import { Definition as Postgres } from './Postgres/definition';
import { PostgresRuntime } from './Postgres/runtime';

export { SourceRuntime, type RuntimeClass, type RuntimeContext, type SyncResult, type SyncRunContext } from './core/runtime';

/**
 * Entry point for the Data Connection worker only — this is what pulls drivers in.
 * Definition id → runtime class.
 */
export const SOURCE_RUNTIMES: Readonly<Record<DataConnection.Source.DefinitionId, RuntimeClass>> = {
    [Postgres.id]: PostgresRuntime as RuntimeClass,
};
