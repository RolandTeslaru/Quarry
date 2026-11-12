import { z } from "zod"
import { Foundations } from "../Foundations"
import { MicroserviceCall } from "../Foundations/MicroserviceCall"
import { Resource } from "../Library/Resource"
import { Build } from "./Build"
import { Job } from "./Job"
import { Recipe } from "./Recipe"
import { API } from "./api"

/** What the Forge service serves other services (docs/design/architecture-split.md §8). */
export namespace Microservice {

    /** The build and its jobs, as the user sees them (RLS) — the realtime gateway's check on a build's channel. */
    export namespace GetBuild {
        export const PATTERN = "forge.get-build"

        export const Request = z.object({ rid: Build.Rid })
        export type  Request = z.infer<typeof Request>

        export const Response = API.GetBuild.Response
        export type  Response = z.infer<typeof Response>
    }

    /** Replaces everything the producer publishes on the branch — a workspace's passing check run, as its pusher. */
    export namespace PublishRecipes {
        export const PATTERN = "forge.publish-recipes"

        export const Request = z.object({
            producerRid: Resource.Rid,
            branch:      Foundations.Branch,
            recipes:     Recipe.Schema.pick({ runtimeConfig: true, inputDatasetRids: true, outputs: true, compute: true }).array(),
        })
        export type  Request = z.infer<typeof Request>

        export const Response = Recipe.Schema.array()
        export type  Response = z.infer<typeof Response>
    }

    /** A job and its recipe, as the user sees them (RLS): Data Connection checking the job asking for a source's credential. */
    export namespace GetJob {
        export const PATTERN = "forge.get-job"

        export const Request = z.object({ rid: Job.Rid })
        export type  Request = z.infer<typeof Request>

        export const Response = z.object({ job: Job.Schema, recipe: Recipe.Schema })
        export type  Response = z.infer<typeof Response>
    }

    export const Calls = {
        getBuild:       GetBuild,
        getJob:         GetJob,
        publishRecipes: PublishRecipes,
    } satisfies MicroserviceCall.Calls
}
