import { z } from "zod"
import { Foundations } from "../Foundations"
import { Dataset } from "../Catalog/Dataset"
import { Resource } from "../Library/Resource"
import { User } from "../Identity/User"
import { Workspace } from "../CodeWorkspace/Workspace"
import { Git } from "../CodeWorkspace/Git"
import { ModuleFunctionPath } from "../CodeWorkspace/ModuleFunctionPath"

/**
 * How to compute some datasets: the runtime that runs it, its inputs and
 * outputs. Published by producers (a workspace's checks, per commit);
 * builds only read them. Immutable — a new version is a new recipe.
 */
export namespace Recipe {

    /** A RID, but not a library resource. */
    export type  Rid = Foundations.Rid<"forge", "recipe">
    export const Rid = Foundations.Rid.generateSchema("forge", "recipe")
    export const createRid = () => Foundations.Rid.create("forge", "recipe")

    /** Which runtime runs the recipe, and what that runtime needs — one per kind of producer. */
    export const Runtime = z.discriminatedUnion("type", [
        z.object({
            type:         z.literal("code-workspace"),
            workspaceRid: Workspace.Rid,
            commit:       Git.Commit,
            transform:    ModuleFunctionPath.Schema,
        }),
    ])
    export type Runtime = z.infer<typeof Runtime>

    export const Compute = z.object({
        cpuCores: z.number().positive(),
        memoryGb: z.number().positive(),
    })
    export type Compute = z.infer<typeof Compute>

    export const Schema = z.object({
        rid:               Rid,
        producerRid:       Resource.Rid,
        branch:            Foundations.Branch,
        runtime:           Runtime,
        inputDatasetRids:  Dataset.Rid.array(),          // a set; the runtime matches them to the code's parameters
        outputDatasetRids: Dataset.Rid.array().min(1),
        compute:           Compute,
        publishedBy:       User.Rid.nullable(),          // null = the system
        publishedAt:       z.coerce.date(),
    })
    export type Schema = z.infer<typeof Schema>
}
