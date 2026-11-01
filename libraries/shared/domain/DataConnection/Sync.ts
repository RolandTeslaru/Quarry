import { z } from "zod"
import { Foundations } from "../Foundations"
import { User } from "../Identity/User"

/**
 * A configured, schedulable instruction: run the source's sync with this config,
 * into this dataset, on this schedule. Each execution is a SyncRun. A RID, but
 * not a library resource.
 */
export namespace Sync {

    export type  Rid = Foundations.Rid<"data-connection", "sync">
    export const Rid = Foundations.Rid.generateSchema("data-connection", "sync")
    export const createRid = () => Foundations.Rid.create("data-connection", "sync")

    /**
     * What to copy — defined by the source's integration (its sync Config in
     * @quarry/integrations), usually a union on `kind`: for Postgres
     * `{ kind: "table", schema, table }` or `{ kind: "query", sql }`.
     * Validated by the server against that Config.
     */
    export const Config = z.record(z.string(), z.unknown())
    export type  Config = z.infer<typeof Config>

    /** Five-field cron; null = manual only. */
    export const Schedule = z.string().regex(/^(\S+\s+){4}\S+$/, "Five-field cron expression").nullable()

    export const Schema = z.object({
        rid:              Rid,
        sourceRid:        Foundations.Rid.generateSchema("data-connection", "source"),
        name:             z.string(),
        config:           Config,
        outputDatasetRid: Foundations.Rid.generateSchema("catalog", "dataset"),
        schedule:         Schedule,
        enabled:          z.boolean(),
        createdBy:        User.Rid.nullable(),
        createdAt:        z.coerce.date(),
    })
    export type Schema = z.infer<typeof Schema>
}
