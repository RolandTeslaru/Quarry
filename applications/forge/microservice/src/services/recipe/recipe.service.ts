import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Forge, type Dataset, type Foundations, type Library } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { DurableEventHandle, InjectDurableEvent } from '@quarry/platform-kernel/infra/durable';
import { RecipeRepository, type PublishedRecipe } from './recipe.repository';

export type { PublishedRecipe };

/**
 * Publishing recipes and reading the current one. Reached as `forge.recipes`
 * — producers call it in-process (a workspace's checks, later Pipeline Builder's
 * deploy); builds read through it.
 */
@Injectable()
export class RecipeService {

    constructor(
        private readonly repository: RecipeRepository,
        @InjectDurableEvent(Forge.DurableEvent.RecipeChanged)
        private readonly durableRecipeChangedEvent: DurableEventHandle<typeof Forge.DurableEvent.RecipeChanged>,
    ) {}

    /** Write on the producer, read on every input, write on every output — RLS's call on the inserts. */
    public async publish(
        principal:   Principal,
        producerRid: Library.Resource.Rid,
        branch:      Foundations.Branch,
        recipes:       PublishedRecipe[],
    ): Promise<Forge.Recipe[]> {
        const published = await this.repository.publish(principal, producerRid, branch, recipes);

        await this.durableRecipeChangedEvent.relay();

        return published;
    }

    /** The recipe computing a dataset now: the first of `branches` with one for it wins. */
    public readonly forDataset = {
        get: (principal: Principal, datasetRid: Dataset.Rid, branches: Foundations.Branch[]): Promise<Forge.Recipe | null> =>
            this.repository.forDatasetGet(principal, datasetRid, branches),

        /** Each dataset's, by dataset, in one read; one nothing builds is left out. */
        getMany: (principal: Principal, datasetRids: Dataset.Rid[], branches: Foundations.Branch[]): Promise<Record<Dataset.Rid, Forge.Recipe>> =>
            this.repository.forDatasetGetMany(principal, datasetRids, branches),
    };

    /** The recipes computing several datasets now, by RID: a recipe writing several of them is one. */
    public readonly forDatasets = {
        /** A dataset nothing builds is a conflict. */
        get: async (principal: Principal, datasetRids: Dataset.Rid[], branches: Foundations.Branch[]): Promise<Record<Forge.Recipe.Rid, Forge.Recipe>> => {
            const byDataset = await this.repository.forDatasetGetMany(principal, datasetRids, branches);
            const recipes: Record<Forge.Recipe.Rid, Forge.Recipe> = {};

            for (const datasetRid of datasetRids) {
                const recipe = byDataset[datasetRid];

                if (!recipe)
                    throw new ConflictException(`Nothing builds ${datasetRid} on ${branches.join(' or ')}`);

                recipes[recipe.rid] = recipe;
            }

            return recipes;
        },

        /**
         * And every recipe upstream of them, walking each recipe's inputs one hop at a time — one read per hop.
         * A dataset nothing builds — given or reached — ends the walk: it's read as it is.
         */
        getUpstream: async (principal: Principal, datasetRids: Dataset.Rid[], branches: Foundations.Branch[]): Promise<Record<Forge.Recipe.Rid, Forge.Recipe>> => {
            const recipes: Record<Forge.Recipe.Rid, Forge.Recipe> = {};
            const seen = new Set<Dataset.Rid>(datasetRids);
            let frontier = [...seen];

            while (frontier.length > 0) {
                const byDataset = await this.repository.forDatasetGetMany(principal, frontier, branches);

                frontier = [];

                for (const recipe of Object.values(byDataset)) {
                    if (recipes[recipe.rid])
                        continue;

                    recipes[recipe.rid] = recipe;

                    for (const inputRid of recipe.inputDatasetRids)
                        if (!seen.has(inputRid)) {
                            seen.add(inputRid);
                            frontier.push(inputRid);
                        }
                }
            }

            return recipes;
        },
    };

    /** These recipes, by RID, in one read; one that isn't there is left out. */
    public async getMany(principal: Principal, rids: Forge.Recipe.Rid[]): Promise<Record<Forge.Recipe.Rid, Forge.Recipe>> {
        return this.repository.getMany(principal, rids);
    }

    public async get(principal: Principal, rid: Forge.Recipe.Rid): Promise<Forge.Recipe> {
        const recipe = await this.repository.get(principal, rid);

        if (!recipe)
            throw new NotFoundException('Not found');

        return recipe;
    }
}
