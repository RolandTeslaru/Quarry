import { Injectable } from '@nestjs/common';
import type { Dataset, Forge, Foundations, Library } from '@quarry/shared/domain';
import type { Principal } from '@/auth/principal';
import { ForgeRepository } from './repository/forge.repository';
import type { PublishedRecipe } from './repository/recipe.repository';

export type { PublishedRecipe };

/**
 * Publishing recipes and reading the current one. Reached as `forge.recipes`
 * — producers call it in-process (a workspace's checks, later Pipeline Builder's
 * deploy); builds read through it.
 */
@Injectable()
export class Recipes {

    constructor(private readonly repository: ForgeRepository) {}

    /** Write on the producer, read on every input, write on every output — RLS's call on the inserts. */
    public async publish(
        principal:   Principal,
        producerRid: Library.Resource.Rid,
        branch:      Foundations.Branch,
        recipes:       PublishedRecipe[],
    ): Promise<Forge.Recipe.Schema[]> {
        return this.repository.recipe.publish(principal, producerRid, branch, recipes);
    }

    /** What computes the dataset: the first of `branches` with a recipe for it wins. */
    public async getCurrent(
        principal:  Principal,
        datasetRid: Dataset.Rid,
        branches:   Foundations.Branch[],
    ): Promise<Forge.Recipe.Schema | null> {
        return this.repository.recipe.getCurrent(principal, datasetRid, branches);
    }
}
