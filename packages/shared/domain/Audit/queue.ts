import { z } from "zod"
import { Foundations } from "../Foundations"
import { User } from "../Identity/User"
import { Application } from "../Platform/Application"
import { AccessEvent } from "./AccessEvent"

/** Audit's background-job contracts. docs/design/audit.md, architecture-split.md §7. */
export namespace Queue {

    /**
     * One access, to be stored — added to the outbox in the transaction of the access it records
     * (an open, a read, a refusal), by whichever server it happened in; consumed by the system worker,
     * which hands it to the main server to store. The job id is the record's: stored once, however
     * often it's delivered.
     */
    export namespace Record {
        export const Job = z.object({
            at:            z.coerce.date(),                   // when it happened, not when it's stored
            userRid:       User.Rid,
            via:           z.string().nullable(),
            resourceRid:   z.string(),
            resourceType:  z.string(),
            action:        AccessEvent.Action.exclude(["modify"]),   // modify: the triggers', in the write's transaction
            applicationId: Application.Id.nullable(),         // only on open
            detail:        z.record(z.string(), z.unknown()),
        })
        export type  Job = z.infer<typeof Job>

        export const Definition = Foundations.Queue.define({
            name:    "audit.record",
            job:     Job,
            result:  z.object({}),
            options: { removeOnComplete: true, removeOnFail: 1000 },
        })
    }
}
