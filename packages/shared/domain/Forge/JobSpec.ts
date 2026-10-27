import { z } from "zod"
import { Foundations } from "../Foundations"
import { Dataset } from "../Catalog/Dataset"
import { Resource } from "../Library/Resource"
import { User } from "../Identity/User"
import { Workspace } from "../CodeWorkspace/Workspace"
import { Git } from "../CodeWorkspace/Git"
import { ModuleFunctionPath } from "../CodeWorkspace/ModuleFunctionPath"

/**
 * How to compute some datasets: a producer's logic at one version, its inputs
 * and outputs. Published by producers (a workspace's checks, per commit);
 * builds only read them. Immutable — a new version is a new spec.
 */
export namespace JobSpec {

    /** A RID, but not a library resource. */
    export type  Rid = Foundations.Rid<"forge", "job-spec">
    export const Rid = Foundations.Rid.generateSchema("forge", "job-spec")
    export const createRid = () => Foundations.Rid.create("forge", "job-spec")

    /** What to run — each producer's own. */
    export const Logic = z.discriminatedUnion("type", [
        z.object({
            type:         z.literal("code-workspace"),
            workspaceRid: Workspace.Rid,
            commit:       Git.Commit,
            transform:    ModuleFunctionPath.Schema,
        }),
    ])
    export type Logic = z.infer<typeof Logic>

    export const Resources = z.object({
        cpuCores: z.number().positive(),
        memoryGb: z.number().positive(),
    })
    export type Resources = z.infer<typeof Resources>

    export const Schema = z.object({
        rid:               Rid,
        producerRid:       Resource.Rid,
        branch:            Foundations.Branch,
        logic:             Logic,
        inputDatasetRids:  Dataset.Rid.array(),          // a set; the runner matches them to the code's parameters
        outputDatasetRids: Dataset.Rid.array().min(1),
        resources:         Resources,
        publishedBy:       User.Rid.nullable(),          // null = the system
        publishedAt:       z.coerce.date(),
    })
    export type Schema = z.infer<typeof Schema>
}
