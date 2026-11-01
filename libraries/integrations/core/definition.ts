import { z } from 'zod';
import { DataConnection } from '@quarry/shared/domain';
import type { CredentialTemplate } from './credential';

/**
 * What a source type is: metadata, capabilities, the credential template it
 * logs in with, and its Config as a zod schema (annotated with `.meta()` for
 * forms) — settings that aren't part of the login. One per external system, in
 * `<System>/definition.ts`, next to that type's credential and runtime.
 *
 * API-safe: a definition imports zod and shared only — never a driver, DuckDB or
 * a runtime. The API loads definitions (definitions.ts); only the Data Connection worker
 * loads runtimes (runtimes.ts) — two entry points of this package.
 */
export interface SourceDefinition<
    C extends z.ZodObject               = z.ZodObject,
    S extends SyncDefinition            = SyncDefinition,
    K extends CredentialTemplate | null = CredentialTemplate | null,
> {
    readonly id:           DataConnection.Source.DefinitionId;
    readonly displayName:  string;
    readonly description:  string;
    readonly icon:         string;
    readonly capabilities: DataConnection.Source.Definition.Capabilities;
    /** What a source of this type logs in with — a source names one credential of this template. Null: needs none. */
    readonly credential:   K;
    readonly Config:       C;
    /** What a sync of this source can copy — implemented by the runtime's `sync(config, run)`. */
    readonly sync:         S;
}

/**
 * What a sync of this system can copy. Config is usually a discriminated union
 * on `kind` — a database offers `{ kind: "table", … } | { kind: "query", … }`,
 * later S3 `{ kind: "files", … }` — rendered as one form (the `kind` switch
 * mounts its fields), and the runtime's one `sync()` switches on it.
 */
export interface SyncDefinition<C extends z.ZodType = z.ZodType> {
    readonly Config:      C;
    /** Whether a run replaces the dataset's view or adds to it — decided by the sync's own config. */
    readonly transaction: (config: z.output<C>) => 'snapshot' | 'append';
}

/** The parsed config a runtime of this definition receives. */
export type ConfigOf<D extends SourceDefinition> = z.output<D['Config']>;

/** The parsed config of a sync of this definition. */
export type SyncConfigOf<D extends SourceDefinition> = z.output<D['sync']['Config']>;

/** The decrypted credential values a runtime of this definition receives (null if it takes none). */
export type CredentialOf<D extends SourceDefinition> =
    D['credential'] extends null ? null : z.output<NonNullable<D['credential']>['Fields']>;

export const defineSync = <C extends z.ZodType>(definition: SyncDefinition<C>): SyncDefinition<C> => definition;

export const defineSource = <C extends z.ZodObject, S extends SyncDefinition, K extends CredentialTemplate | null>(
    definition: SourceDefinition<C, S, K>,
): SourceDefinition<C, S, K> => ({
    ...definition,
    id: DataConnection.Source.DefinitionId.parse(definition.id),
});

/** As the API sends it: Config becomes JSON Schema (input side — fields with defaults are optional). */
export const toWire = (definition: SourceDefinition): DataConnection.Source.Definition.Schema =>
    DataConnection.Source.Definition.Schema.parse({
        id:           definition.id,
        displayName:  definition.displayName,
        description:  definition.description,
        icon:         definition.icon,
        capabilities: definition.capabilities,
        credentialTemplateId: definition.credential?.id ?? null,
        configSchema:     z.toJSONSchema(definition.Config, { io: 'input' }),
        syncConfigSchema: z.toJSONSchema(definition.sync.Config, { io: 'input' }),
    });
