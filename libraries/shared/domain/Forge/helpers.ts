import type { Dataset } from "../Dataset/Dataset"
import type { Resource } from "../Library/Resource"
import type { Build } from "./Build"
import { Recipe } from "./Recipe"

/** Recipes that can never run: on a cycle — reading each other's outputs — or waiting on one. */
export class PlanCycleError extends Error {
    readonly recipeRids: Recipe.Rid[]

    constructor(recipeRids: Recipe.Rid[]) {
        super(`The recipes read each other's outputs in a cycle: ${recipeRids.join(", ")}`)
        this.recipeRids = recipeRids
    }
}

/**
 * The recipes as a plan: a recipe is the child of each recipe in it that writes one of its inputs;
 * recipes with no parent are the roots. Throws a PlanCycleError if some recipe could never run. Reached as `Build.Plan.create`.
 */
export function createPlan(recipes: Record<Recipe.Rid, Recipe>): Build.Plan {
    const { producerOf } = Recipe.getResources(recipes)
    const children: Record<Recipe.Rid, Set<Recipe.Rid>> = {}
    const hasParent = new Set<Recipe.Rid>()

    // Every recipe starts with no children.
    for (const recipe of Object.values(recipes))
        children[recipe.rid] = new Set()

    // A recipe is the child of whichever recipe writes one of its inputs — not of itself, when it reads its own output.
    for (const recipe of Object.values(recipes)) {
        for (const datasetRid of recipe.inputDatasetRids) {
            const parent = producerOf[datasetRid]?.rid

            if (!parent || parent === recipe.rid)
                continue

            children[parent].add(recipe.rid)
            hasParent.add(recipe.rid)
        }
    }

    const plan: Build.Plan = { roots: [], children: {} }
    const parentsLeft: Record<Recipe.Rid, number> = {}

    // Children as arrays, as forge.build.plan stores them; a recipe with no parent is a root.
    for (const rid of Object.keys(recipes) as Recipe.Rid[]) {
        plan.children[rid] = [...children[rid]]
        parentsLeft[rid] = 0

        if (!hasParent.has(rid))
            plan.roots.push(rid)
    }

    // How many parents each recipe waits for.
    for (const rid of Object.keys(recipes) as Recipe.Rid[])
        for (const child of children[rid])
            parentsLeft[child]++

    const reached = new Set<Recipe.Rid>(plan.roots)
    const next = [...plan.roots]

    // From the roots, a recipe is reached once all its parents are — the order a build runs them in.
    while (next.length > 0) {
        const rid = next.pop()!

        for (const child of children[rid]) {
            parentsLeft[child]--

            if (parentsLeft[child] === 0) {
                reached.add(child)
                next.push(child)
            }
        }
    }

    const neverReached: Recipe.Rid[] = []

    // One never reached is on a cycle, or waits on one.
    for (const rid of Object.keys(recipes) as Recipe.Rid[])
        if (!reached.has(rid))
            neverReached.push(rid)

    if (neverReached.length > 0)
        throw new PlanCycleError(neverReached)

    return plan
}

/**
 * The recipes on a path from the inputs: each reading one of them, or an output of one that does. A recipe
 * writing an input is never one — inputs are read as they are. Reached as `Build.getConnectingRecipes`.
 */
export function getConnectingRecipes(recipes: Record<Recipe.Rid, Recipe>, inputRids: Dataset.Rid[]): Record<Recipe.Rid, Recipe> {
    const inputs = new Set<Resource.Rid>(inputRids)
    const reached = new Set<Resource.Rid>(inputRids)
    const connecting: Record<Recipe.Rid, Recipe> = {}
    let grew = true

    // Until a pass adds nothing: a recipe reading a reached dataset connects, and its outputs are reached.
    while (grew) {
        grew = false

        for (const recipe of Object.values(recipes)) {
            if (connecting[recipe.rid])
                continue

            const outputs = Recipe.getOutputs(recipe)
            let writesInput = false
            let readsReached = false

            for (const outputRid of outputs)
                if (inputs.has(outputRid))
                    writesInput = true

            for (const datasetRid of recipe.inputDatasetRids)
                if (reached.has(datasetRid))
                    readsReached = true

            if (writesInput || !readsReached)
                continue

            connecting[recipe.rid] = recipe
            grew = true

            for (const outputRid of outputs)
                reached.add(outputRid)
        }
    }

    return connecting
}
