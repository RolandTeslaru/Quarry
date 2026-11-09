import { z } from "zod"
import { Durable } from "../Durable"
import { Foundations } from "../Foundations"
import { Dataset } from "../Dataset/Dataset"
import { Resource } from "../Library/Resource"
import { Job } from "./Job"
import { Recipe } from "./Recipe"

/** Forge's durable events (docs/design/durable-queues.md): published in the transaction that makes them true. */
export namespace DurableEvent {

    /**
     * What computes a dataset changed — its runtime config, inputs or how it's written; a new recipe
     * computing it the same way isn't a change. `recipeRid` null: nothing computes it any more.
     */
    export const RecipeChanged = Durable.Event.define({
        topic:   "forge:recipe:changed",
        payload: z.object({
            datasetRid:  Dataset.Rid,
            branch:      Foundations.Branch,
            producerRid: Resource.Rid,
            recipeRid:   Recipe.Rid.nullable(),
        }),
    })

    /** A job finished, its outputs committed — with or without new data. Once per job; its id: the job's RID. */
    export const JobSucceeded = Durable.Event.define({
        topic:   "forge:job:succeeded",
        payload: z.object({ job: Job.Schema }),
    })

    /** A job finished failing, its outputs aborted. Once per job; its id: the job's RID. */
    export const JobFailed = Durable.Event.define({
        topic:   "forge:job:failed",
        payload: z.object({ job: Job.Schema }),
    })
}
