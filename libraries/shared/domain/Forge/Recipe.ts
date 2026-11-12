import { z } from "zod"
import { Foundations } from "../Foundations"
import { Dataset } from "../Dataset/Dataset"
import { Sync } from "../DataConnection/Sync"
import { Source } from "../DataConnection/Source"
import { Resource } from "../Library/Resource"
import { User } from "../Identity/User"
import { Workspace } from "../CodeWorkspace/Workspace"
import { Git } from "../CodeWorkspace/Git"
import { ModuleFunctionPath } from "../CodeWorkspace/ModuleFunctionPath"

/**
 * How to compute some resources — datasets, so far: the runtime that runs it,
 * its input datasets and its outputs. Published by producers (a workspace's checks, per commit);
 * builds only read them. Immutable — a new version is a new recipe.
 */
export namespace Recipe {

    /** A RID, but not a library resource. */
    export type  Rid = Foundations.Rid<"forge", "recipe">
    export const Rid = Foundations.Rid.generateSchema("forge", "recipe")
    export const createRid = () => Foundations.Rid.create("forge", "recipe")

    /** Which runtime runs the recipe, and what that runtime needs — one per kind of producer. */
    export const RuntimeConfig = z.discriminatedUnion("type", [
        z.object({
            type:         z.literal("code-workspace"),
            workspaceRid: Workspace.Rid,
            commit:       Git.Commit,
            transform:    ModuleFunctionPath.Schema,
            inputs:       z.record(z.string(), Dataset.Rid),     // the transform's parameter → the dataset it reads
            outputs:      z.record(z.string(), Dataset.Rid),     // the transform's parameter → the dataset it writes
        }),
        z.object({
            type:       z.literal("data-connection"),
            sourceRid:  Source.Rid,
            syncRid:    Sync.Rid,
            syncConfig: Sync.Config,                             // what to copy, as the sync said when this was published
        }),
    ])
    export type RuntimeConfig = z.infer<typeof RuntimeConfig>

    /** How a job writes its outputs: replacing each dataset's view, or adding to it — by a column, for an incremental sync. */
    export const OutputTransaction = z.discriminatedUnion("type", [
        z.object({ type: z.literal("snapshot") }),
        z.object({ type: z.literal("append"), incrementalColumn: z.string().min(1).nullable() }),
    ])
    export type OutputTransaction = z.infer<typeof OutputTransaction>

    /** One resource the recipe writes, by its kind: what Forge opens, commits and aborts for it. Datasets only, so far. */
    export const Output = z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("dataset"), transaction: OutputTransaction }),
    ])
    export type Output = z.infer<typeof Output>

    export const Compute = z.object({
        cpuCores: z.number().positive(),
        memoryGb: z.number().positive(),
    })
    export type Compute = z.infer<typeof Compute>

    export const Schema = z.object({
        rid:               Rid,
        producerRid:       Resource.Rid,
        branch:            Foundations.Branch,
        runtimeConfig:     RuntimeConfig,
        inputDatasetRids:  Dataset.Rid.array(),          // a set; the runtime matches them to the code's parameters
        outputs:           z.record(Resource.Rid, Output)                   // each resource it writes, and how a job writes it
            .refine((outputs) => Object.keys(outputs).length > 0, "A recipe writes at least one resource"),
        compute:           Compute,
        publishedBy:       User.Rid.nullable(),          // null = the system
        publishedAt:       z.coerce.date(),
    })

    /**
     * What the recipe computes the output from: two recipes with equal ones compute it the same way.
     * Compute resources aside — more memory isn't new logic. Inputs are a set, so sorted.
     */
    export const getComputation = (recipe: Pick<Recipe, "runtimeConfig" | "inputDatasetRids" | "outputs">, outputRid: Resource.Rid) => ({
        runtimeConfig:    recipe.runtimeConfig,
        inputDatasetRids: [...recipe.inputDatasetRids].sort(),
        output:           recipe.outputs[outputRid],
    })

    /** The resources the recipe writes, whatever their kind. */
    export const getOutputs = (recipe: Pick<Recipe, "outputs">) => Object.keys(recipe.outputs) as Resource.Rid[]

    /** The datasets the recipe writes, and how a job writes each. */
    export function getDatasetOutputs(recipe: Pick<Recipe, "outputs">): Record<Dataset.Rid, OutputTransaction> {
        const datasets: Record<Dataset.Rid, OutputTransaction> = {}

        for (const rid of getOutputs(recipe)) {
            const output = recipe.outputs[rid]

            if (output.kind === "dataset")
                datasets[rid as Dataset.Rid] = output.transaction
        }

        return datasets
    }

    /** The resources some recipes write and the datasets they read. */
    export interface Resources {
        producerOf: Record<Resource.Rid, Recipe>         // which of them writes each output
        outputs:    Set<Resource.Rid>
        inputs:     Set<Dataset.Rid>
    }

    export function getResources(recipes: Record<Rid, Recipe>): Resources {
        const resources: Resources = { producerOf: {}, outputs: new Set(), inputs: new Set() }

        for (const recipe of Object.values(recipes)) {
            for (const outputRid of getOutputs(recipe)) {
                resources.producerOf[outputRid] = recipe
                resources.outputs.add(outputRid)
            }

            for (const datasetRid of recipe.inputDatasetRids)
                resources.inputs.add(datasetRid)
        }

        return resources
    }
}
export type Recipe = z.infer<typeof Recipe.Schema>
