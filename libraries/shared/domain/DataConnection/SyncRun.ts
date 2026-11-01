import { z } from "zod"
import { Foundations } from "../Foundations"
import { User } from "../Identity/User"
import { Sync } from "./Sync"

/** One execution of a sync. Each retry is its own run. */
export namespace SyncRun {

    export type  Rid = Foundations.Rid<"data-connection", "sync-run">
    export const Rid = Foundations.Rid.generateSchema("data-connection", "sync-run")
    export const createRid = () => Foundations.Rid.create("data-connection", "sync-run")

    export const Status = z.enum(["running", "succeeded", "failed"])
    export type  Status = z.infer<typeof Status>

    export const Trigger = z.enum(["manual", "schedule"])
    export type  Trigger = z.infer<typeof Trigger>

    export const Schema = z.object({
        rid:            Rid,
        syncRid:        Sync.Rid,
        status:         Status,
        transactionRid: Foundations.Rid.generateSchema("catalog", "transaction").nullable(),
        stateFrom:      z.string().nullable(),           // what the previous successful run left (opaque to everyone but the integration)
        stateTo:        z.string().nullable(),           // what this run leaves for the next — e.g. a high-water mark
        rowCount:       z.number().int().nullable(),
        error:          z.unknown().nullable(),
        trigger:        Trigger,
        triggeredBy:    User.Rid.nullable(),
        startedAt:      z.coerce.date(),
        heartbeatAt:    z.coerce.date(),
        finishedAt:     z.coerce.date().nullable(),
    })
    export type Schema = z.infer<typeof Schema>
}
