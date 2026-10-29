import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Catalog, Forge, Foundations, Library } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { Repository, Transactional } from '@/db/repository';
import { json } from '@/db/table';
import { ForgeDB } from '../forge.db';

/** A recipe as a producer publishes it — Forge fills in the RID, branch, producer and who. */
export interface PublishedRecipe {
    readonly driver:             Forge.Recipe.Driver;
    readonly inputDatasetRids:  Catalog.Dataset.Rid[];
    readonly outputDatasetRids: Catalog.Dataset.Rid[];
    readonly compute:           Forge.Recipe.Compute;
}

/** forge.recipe, its input/output datasets, and forge.current_recipe — one aggregate. */
@Injectable()
export class RecipeRepository extends Repository(ForgeDB.database) {

    /**
     * Replaces everything the producer publishes on the branch: inserts the new
     * recipes, drops the producer's old pointers, points each output at its new
     * recipe. An output another producer owns is a conflict.
     */
    @Transactional()
    public async publish(
        principal:   Principal,
        producerRid: Library.Resource.Rid,
        branch:      Foundations.Branch,
        recipes:       PublishedRecipe[],
    ): Promise<Forge.Recipe.Schema[]> {
        const outputs = recipes.flatMap((recipe) => recipe.outputDatasetRids);

        if (new Set(outputs).size !== outputs.length)
            throw new BadRequestException('Two recipes write the same dataset');

        await this._requireUnowned(producerRid, branch, outputs);

        await this.trx
            .deleteFrom('forge.current_recipe')
            .where('branch', '=', branch)
            .where('recipe_rid', 'in', (eb) => eb
                .selectFrom('forge.recipe')
                .select('rid')
                .where('producer_rid', '=', producerRid)
                .where('branch', '=', branch))
            .execute();

        const published: Forge.Recipe.Schema[] = [];

        for (const recipe of recipes)
            published.push(await this._insert(principal, producerRid, branch, recipe));

        return published;
    }

    /** The recipe computing the dataset on the first of `branches` that has one; null if none does. */
    @Transactional()
    public async getCurrent(
        principal:  Principal,
        datasetRid: Catalog.Dataset.Rid,
        branches:   Foundations.Branch[],
    ): Promise<Forge.Recipe.Schema | null> {
        const pointers = await this.trx
            .selectFrom('forge.current_recipe')
            .selectAll()
            .where('dataset_rid', '=', datasetRid)
            .where('branch', 'in', branches)
            .execute();

        const pointer = branches
            .map((branch) => pointers.find((candidate) => candidate.branch === branch))
            .find((candidate) => candidate !== undefined);

        if (!pointer)
            return null;

        return this.get(principal, pointer.recipe_rid);
    }

    @Transactional()
    public async get(principal: Principal, rid: Forge.Recipe.Rid): Promise<Forge.Recipe.Schema | null> {
        const row = await this.trx
            .selectFrom('forge.recipe')
            .selectAll()
            .where('rid', '=', rid)
            .executeTakeFirst();

        if (!row)
            return null;

        const inputs = await this.trx
            .selectFrom('forge.recipe_input_dataset')
            .select('dataset_rid')
            .where('recipe_rid', '=', rid)
            .execute();

        const outputs = await this.trx
            .selectFrom('forge.recipe_output_dataset')
            .select('dataset_rid')
            .where('recipe_rid', '=', rid)
            .execute();

        return ForgeDB.Recipe.toDomain(
            row,
            inputs.map((input) => input.dataset_rid),
            outputs.map((output) => output.dataset_rid),
        );
    }

    // ── helpers ─────────────────────────────────────────────────────────

    /** The recipe, its datasets, and a pointer from each output. */
    private async _insert(
        principal:   Principal,
        producerRid: Library.Resource.Rid,
        branch:      Foundations.Branch,
        recipe:        PublishedRecipe,
    ): Promise<Forge.Recipe.Schema> {
        const rid = Forge.Recipe.createRid();

        const row = await this.trx
            .insertInto('forge.recipe')
            .values({
                rid,
                producer_rid: producerRid,
                branch,
                driver:        json(recipe.driver),
                compute:      json(recipe.compute),
                published_by: Principal.actorOf(principal),
            })
            .returningAll()
            .executeTakeFirstOrThrow();

        if (recipe.inputDatasetRids.length > 0)
            await this.trx
                .insertInto('forge.recipe_input_dataset')
                .values(recipe.inputDatasetRids.map((datasetRid) => ({ recipe_rid: rid, dataset_rid: datasetRid })))
                .execute();

        await this.trx
            .insertInto('forge.recipe_output_dataset')
            .values(recipe.outputDatasetRids.map((datasetRid) => ({ recipe_rid: rid, dataset_rid: datasetRid })))
            .execute();

        await this.trx
            .insertInto('forge.current_recipe')
            .values(recipe.outputDatasetRids.map((datasetRid) => ({ dataset_rid: datasetRid, branch, recipe_rid: rid })))
            .execute();

        return ForgeDB.Recipe.toDomain(row, recipe.inputDatasetRids, recipe.outputDatasetRids);
    }

    /**
     * One producer per dataset per branch. The pointer's primary key enforces it;
     * this names the producer when the caller can see it.
     */
    private async _requireUnowned(producerRid: Library.Resource.Rid, branch: Foundations.Branch, outputs: Catalog.Dataset.Rid[]): Promise<void> {
        if (outputs.length === 0)
            return;

        const owned = await this.trx
            .selectFrom('forge.current_recipe as pointer')
            .innerJoin('forge.recipe as recipe', 'recipe.rid', 'pointer.recipe_rid')
            .select(['pointer.dataset_rid', 'recipe.producer_rid'])
            .where('pointer.branch', '=', branch)
            .where('pointer.dataset_rid', 'in', outputs)
            .where('recipe.producer_rid', '!=', producerRid)
            .executeTakeFirst();

        if (owned)
            throw new ConflictException(`${owned.dataset_rid} is already produced by ${owned.producer_rid} on ${branch}`);
    }
}
