import type { DuckDBConnection } from '@duckdb/node-api';
import type { DataConnection } from '@quarry/shared/domain';
import type { ConfigOf, CredentialOf, SourceDefinition, SyncConfigOf } from './definition';

/**
 * What every runtime gets from the Data Connection worker — an interface, so this
 * package doesn't depend on the worker; the worker passes its DuckDb.
 */
export interface RuntimeContext {
    /** A DuckDB connection the runtime owns and closes (closeSync). */
    readonly duckdb: { connect(): Promise<DuckDBConnection> };
}

/** What one sync run gets. */
export interface SyncRunContext {
    /** `s3://bucket/<dataset>/<transaction>/` — a fresh, empty prefix to write Parquet into. */
    readonly destination: string;
    /** What the previous successful run returned as `state` (null on the first run) — opaque to everyone else. */
    readonly state:       string | null;
}

export interface SyncResult {
    readonly rowCount: number;
    /** What the next run starts from — e.g. a high-water mark — or null if this sync keeps none. */
    readonly state:    string | null;
}

/**
 * One live connection to one source — the implementation of a definition, in
 * `<System>/runtime.ts`. Created by the Data Connection worker's SourceRuntimes, never by
 * DI; loaded through the `runtimes` entry point only.
 *
 *   sync run   open → sync(config, run) → close
 *   test       open → close            (open succeeding is the test)
 *   explore    open → explore → close
 *   preview    open → preview(table) → close   (a table's first rows; with explore)
 *   (later) streaming: open → stream … → close, kept alive by a registry
 *
 * The connection lives on the instance: open() creates it, close() releases it.
 * `credential` holds the decrypted values of the source's credential (parsed
 * against the definition's template) — they exist only in the Data Connection worker's memory.
 */
export abstract class SourceRuntime<D extends SourceDefinition = SourceDefinition> {

    constructor(
        readonly rid:                  DataConnection.Source.Rid,
        protected readonly config:     ConfigOf<D>,
        protected readonly credential: CredentialOf<D>,
        protected readonly ctx:        RuntimeContext,
    ) {}

    abstract open(): Promise<void>;

    /** Idempotent; must not throw after a failed open. */
    abstract close(): Promise<void>;

    /** One sync run: write Parquet under `run.destination` for this config (switch on its `kind`), return the next state. */
    abstract sync(config: SyncConfigOf<D>, run: SyncRunContext): Promise<SyncResult>;

    /** Lists readable tables — present iff the definition's `capabilities.explore`. */
    explore?(): Promise<DataConnection.Source.Table[]>;

    /** A table's first `limit` rows — present with `explore`: a listed table can be looked into. */
    preview?(table: DataConnection.Source.Table, limit: number): Promise<DataConnection.Source.TablePreview>;
}

export type RuntimeClass = new (rid: DataConnection.Source.Rid, config: never, credential: never, ctx: RuntimeContext) => SourceRuntime;
