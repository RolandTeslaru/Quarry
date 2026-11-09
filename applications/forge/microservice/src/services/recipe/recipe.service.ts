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
    };

    /** The recipes computing several datasets now, by RID: a recipe writing several of them is one. A dataset nothing builds is a conflict. */
    public readonly forDatasets = {
        get: async (principal: Principal, datasetRids: Dataset.Rid[], branches: Foundations.Branch[]): Promise<Record<Forge.Recipe.Rid, Forge.Recipe>> => {
            const recipes: Record<Forge.Recipe.Rid, Forge.Recipe> = {};

            for (const datasetRid of datasetRids) {
                const recipe = await this.repository.forDatasetGet(principal, datasetRid, branches);

                if (!recipe)
                    throw new ConflictException(`Nothing builds ${datasetRid} on ${branches.join(' or ')}`);

                recipes[recipe.rid] = recipe;
            }

            return recipes;
        },

        /** And every recipe upstream of them, walking each recipe's inputs. The walk stops at a dataset nothing builds: it's read as it is. */
        getUpstream: async (principal: Principal, datasetRids: Dataset.Rid[], branches: Foundations.Branch[]): Promise<Record<Forge.Recipe.Rid, Forge.Recipe>> => {
            const recipes = await this.forDatasets.get(principal, datasetRids, branches);
            const seen = new Set<Dataset.Rid>(datasetRids);
            const next: Dataset.Rid[] = [];

            for (const recipe of Object.values(recipes))
                next.push(...recipe.inputDatasetRids);

            while (next.length > 0) {
                const datasetRid = next.pop()!;

                if (seen.has(datasetRid))
                    continue;

                seen.add(datasetRid);

                const recipe = await this.repository.forDatasetGet(principal, datasetRid, branches);

                if (!recipe || recipes[recipe.rid])
                    continue;

                recipes[recipe.rid] = recipe;
                next.push(...recipe.inputDatasetRids);
            }

            return recipes;
        },
    };

    public async get(principal: Principal, rid: Forge.Recipe.Rid): Promise<Forge.Recipe> {
        const recipe = await this.repository.get(principal, rid);

        if (!recipe)
            throw new NotFoundException('Not found');

        return recipe;
    }
}
