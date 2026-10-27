import { z } from "zod"
import { Foundations } from "../Foundations"
import { User } from "../Identity/User"
import { Workspace } from "./Workspace"
import { Git } from "./Git"

/**
 * CI for one pushed branch head: the steps of its quarry-ci.yml, then — if
 * they all pass — its job specs published. docs/design/code-workspaces/checks.md.
 */
export namespace CheckRun {

    /** A RID, but not a library resource. */
    export type  Rid = Foundations.Rid<"code-workspace", "check-run">
    export const Rid = Foundations.Rid.generateSchema("code-workspace", "check-run")
    export const createRid = () => Foundations.Rid.create("code-workspace", "check-run")

    /** `queued`: decided, maybe not yet sent to the worker · `canceled`: a newer push to the branch superseded it. */
    export const Status = z.enum(["queued", "running", "succeeded", "failed", "canceled"])
    export type  Status = z.infer<typeof Status>

    export const UNFINISHED: readonly Status[] = ["queued", "running"]

    export namespace Step {

        export const Status = z.enum(["waiting", "running", "succeeded", "failed", "skipped"])
        export type  Status = z.infer<typeof Status>

        export const Schema = z.object({
            name:       z.string(),
            status:     Status,
            exitCode:   z.number().int().nullable(),
            startedAt:  z.coerce.date().nullable(),
            finishedAt: z.coerce.date().nullable(),
            log:        z.string(),                     // the last LOG_TAIL_BYTES
        })
        export type Schema = z.infer<typeof Schema>

        /** How much of a step's output is kept. */
        export const LOG_TAIL_BYTES = 64 * 1024
    }

    /** The server's own steps around the file's: reading quarry-ci.yml, and validating and publishing the manifest. */
    export const PARSE_STEP = "Parse quarry-ci.yml"
    export const PUBLISH_STEP = "Validate & publish"

    export const Failure = z.object({
        step:    z.string(),                            // the step's name
        message: z.string(),
    })
    export type Failure = z.infer<typeof Failure>

    export const Schema = z.object({
        rid:          Rid,
        workspaceRid: Workspace.Rid,
        branch:       Foundations.Branch,
        commit:       Git.Commit,
        status:       Status,
        steps:        Step.Schema.array(),
        published:    z.boolean(),                      // its commit became the branch's job specs
        failure:      Failure.nullable(),
        pushedBy:     User.Rid.nullable(),              // whom it acts as; null = the system
        createdAt:    z.coerce.date(),
        startedAt:    z.coerce.date().nullable(),        // claimed by dispatch, sent to the worker
        reportedAt:   z.coerce.date().nullable(),        // the worker's last report; null until it takes the run
        finishedAt:   z.coerce.date().nullable(),
    })
    export type Schema = z.infer<typeof Schema>

    /** A check step's state as the worker reports it. */
    export const REPORTED_STEP_STATUSES = ["running", "succeeded", "failed"] as const

    /** Where the worker's step `index` (the file's steps, from 0) is in `steps`: after Parse. */
    export const getStepPosition = (index: number): number => index + 1
}
