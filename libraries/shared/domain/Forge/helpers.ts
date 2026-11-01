import type { Dataset } from "../Dataset/Dataset"
import type { Build } from "./Build"
import type { Recipe } from "./Recipe"

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
    const producerOf: Record<Dataset.Rid, Recipe.Rid> = {}
    const children: Record<Recipe.Rid, Set<Recipe.Rid>> = {}
    const hasParent = new Set<Recipe.Rid>()

    // Which recipe writes each dataset; every recipe starts with no children.
    for (const recipe of Object.values(recipes)) {
        children[recipe.rid] = new Set()

        for (const datasetRid of recipe.outputDatasetRids)
            producerOf[datasetRid] = recipe.rid
    }

    // A recipe is the child of whichever recipe writes one of its inputs — not of itself, when it reads its own output.
    for (const recipe of Object.values(recipes)) {
        for (const datasetRid of recipe.inputDatasetRids) {
            const parent = producerOf[datasetRid]

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
