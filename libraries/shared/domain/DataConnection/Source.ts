import { z } from "zod"
import { Foundations } from "../Foundations"
import { Resource } from "../Library/Resource"
import { Credential } from "../Keychain/Credential"
import { ColumnSchema } from "../Catalog/ColumnSchema"

/**
 * A configured external system — a library resource. Logs in with a Keychain
 * credential it names by RID; never holds credential values itself.
 *
 * What a source *is* comes from its definition (Postgres, …) in
 * @quarry/integrations, so here `config` is an open record — the server
 * validates it against the definition's zod Config, and clients render it from
 * `Definition.configSchema`.
 */
export namespace Source {

    export type  Rid = Foundations.Rid<"data-connection", "source">
    export const Rid = Foundations.Rid.generateSchema("data-connection", "source")
    export const createRid = () => Foundations.Rid.create("data-connection", "source")

    /** Which definition a source uses, e.g. "postgres". */
    export const DefinitionId = z.string().regex(/^[a-z][a-z0-9-]*$/, "kebab-case definition id")
    export type  DefinitionId = z.infer<typeof DefinitionId>

    /** Definition-specific settings, validated by the server against that definition's Config. */
    export const Config = z.record(z.string(), z.unknown())
    export type  Config = z.infer<typeof Config>

    export const Schema = Resource.Base.extend({
        rid:          Rid,
        type:         z.literal("source"),
        parentRid:    Resource.Rid,
        definitionId:  DefinitionId,
        config:        Config,
        /** Of the definition's credential template; null iff the definition takes none. */
        credentialRid: Credential.Rid.nullable(),
        /** Where its syncs' datasets go by default — a project or folder; null: the source's own folder. */
        outputFolderRid: Resource.Rid.nullable(),
    })
    export type Schema = z.infer<typeof Schema>

    /**
     * A source definition as the API sends it: metadata, what it can do, and its
     * Config as JSON Schema — enough to list source types and render their forms.
     */
    export namespace Definition {
        export const Capabilities = z.object({
            explore: z.boolean(),                   // can list its tables
        })
        export type Capabilities = z.infer<typeof Capabilities>

        export const Schema = z.object({
            id:           DefinitionId,
            displayName:  z.string(),
            description:  z.string(),
            icon:         z.string(),
            capabilities: Capabilities,
            /** The Keychain template a source of this type logs in with; null: none. */
            credentialTemplateId: Credential.Template.Id.nullable(),
            configSchema: z.record(z.string(), z.unknown()),       // z.toJSONSchema(Config)
            /** A sync's config form (usually a `oneOf` on `kind`: what to copy) — z.toJSONSchema(sync.Config). */
            syncConfigSchema: z.record(z.string(), z.unknown()),
        })
        export type Schema = z.infer<typeof Schema>
    }

    /** A table a source exposes, as found by exploring it. */
    export const Table = z.object({
        schema: z.string(),
        name:   z.string(),
    })
    export type Table = z.infer<typeof Table>

    /** A table's first rows, read live from the source: its columns (as dataset types) and rows, one array per row in column order. */
    export const TablePreview = z.object({
        columns: z.object({ name: z.string(), type: ColumnSchema.Type }).array(),
        rows:    z.unknown().array().array(),
    })
    export type TablePreview = z.infer<typeof TablePreview>
}
