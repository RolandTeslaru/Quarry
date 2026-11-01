import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Dataset, Forge, Foundations, Library } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { ForgeRepository } from '../forge/repository/forge.repository';
import type { PublishedRecipe } from '../forge/repository/recipe.repository';

export type { PublishedRecipe };

/**
 * Publishing recipes and reading the current one. Reached as `forge.recipes`
 * — producers call it in-process (a workspace's checks, later Pipeline Builder's
 * deploy); builds read through it.
 */
@Injectable()
export class RecipeService {

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

    /**
     * Each dataset's current recipe — the first of `branches` with one wins — by RID: a recipe writing
     * several of the datasets is one. A dataset nothing builds is a conflict.
     */
    public async getCurrentForEach(
        principal:   Principal,
        datasetRids: Dataset.Rid[],
        branches:    Foundations.Branch[],
    ): Promise<Record<Forge.Recipe.Rid, Forge.Recipe.Schema>> {
        const recipes: Record<Forge.Recipe.Rid, Forge.Recipe.Schema> = {};

        for (const datasetRid of datasetRids) {
            const recipe = await this.repository.recipe.getCurrent(principal, datasetRid, branches);

            if (!recipe)
                throw new ConflictException(`Nothing builds ${datasetRid} on ${branches.join(' or ')}`);

            recipes[recipe.rid] = recipe;
        }

        return recipes;
    }

    public async get(principal: Principal, rid: Forge.Recipe.Rid): Promise<Forge.Recipe.Schema> {
        const recipe = await this.repository.recipe.get(principal, rid);

        if (!recipe)
            throw new NotFoundException('Not found');

        return recipe;
    }
}
