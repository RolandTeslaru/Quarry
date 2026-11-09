import { isDeepStrictEqual } from 'node:util';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Dataset, Durable, Forge, Foundations, Library } from '@quarry/shared/domain';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { Repository, Transactional } from '@quarry/platform-kernel/db/repository';
import { json } from '@quarry/platform-kernel/db/table';
import { DurableEventHandle, InjectDurableEvent } from '@quarry/platform-kernel/infra/durable';
import { LibraryService } from '@quarry/platform-kernel/services/Library/library.service';
import { ForgeDB } from '../forge/forge.db';

/** A recipe as a producer publishes it — Forge fills in the RID, branch, producer and who. */
export interface PublishedRecipe {
    readonly runtimeConfig:     Forge.Recipe.RuntimeConfig;
    readonly inputDatasetRids:  Dataset.Rid[];
    readonly outputTransactions: Forge.Recipe['outputTransactions'];
    readonly compute:           Forge.Recipe.Compute;
}

/** forge.recipe, its input/output datasets, and forge.current_recipe — one aggregate. */
@Injectable()
export class RecipeRepository extends Repository(ForgeDB.database) {

    constructor(
        private readonly library: LibraryService,
        @InjectDurableEvent(Forge.DurableEvent.RecipeChanged)
        private readonly durableRecipeChangedEvent: DurableEventHandle<typeof Forge.DurableEvent.RecipeChanged>,
    ) {
        super();
    }

    /**
     * Replaces everything the producer publishes on the branch: inserts the new
     * recipes, drops the producer's old pointers, points each output at its new
     * recipe, and declares the producer's lineage: each input → each output, or
     * the producer → each output for a recipe with no inputs. An output another
     * producer owns is a conflict. `forge:recipe:changed` for each dataset now computed
     * differently, or no longer computed.
     */
    @Transactional()
    public async publish(
        principal:   Principal,
        producerRid: Library.Resource.Rid,
        branch:      Foundations.Branch,
        recipes:     PublishedRecipe[],
    ): Promise<Forge.Recipe[]> {
        const outputs: Dataset.Rid[] = [];

        for (const recipe of recipes)
            outputs.push(...Object.keys(recipe.outputTransactions) as Dataset.Rid[]);

        const outputRids = new Set(outputs);

        if (outputRids.size !== outputs.length)
            throw new BadRequestException('Two recipes write the same dataset');

        await this.requireUnowned(producerRid, branch, outputs);

        const pointers = await this.trx
            .selectFrom('forge.current_recipe as pointer')
            .innerJoin('forge.recipe as recipe', 'recipe.rid', 'pointer.recipe_rid')
            .select(['pointer.dataset_rid', 'pointer.recipe_rid'])
            .where('pointer.branch', '=', branch)
            .where('recipe.producer_rid', '=', producerRid)
            .execute();

        const previous: Record<Dataset.Rid, Forge.Recipe> = {};

        for (const pointer of pointers)
            previous[pointer.dataset_rid] = (await this.get(principal, pointer.recipe_rid))!;

        await this.trx
            .deleteFrom('forge.current_recipe')
            .where('branch', '=', branch)
            .where('recipe_rid', 'in', (eb) => eb
                .selectFrom('forge.recipe')
                .select('rid')
                .where('producer_rid', '=', producerRid)
                .where('branch', '=', branch))
            .execute();

        const published: Forge.Recipe[] = [];

        const edges: Pick<Library.Lineage.Edge, 'upstreamRid' | 'downstreamRid'>[] = [];

        for (const recipe of recipes) {
            published.push(await this.insert(principal, producerRid, branch, recipe));

            const upstreamRids = recipe.inputDatasetRids.length > 0 ? recipe.inputDatasetRids : [producerRid];

            for (const upstreamRid of upstreamRids)
                for (const downstreamRid of Object.keys(recipe.outputTransactions) as Dataset.Rid[])
                    edges.push({ upstreamRid, downstreamRid });
        }

        await this.library.lineage.declare(principal, producerRid, branch, edges);       // joins this transaction

        const changes: Durable.Event.InputOf<typeof Forge.DurableEvent.RecipeChanged>[] = [];

        for (const recipe of published)
            for (const datasetRid of Object.keys(recipe.outputTransactions) as Dataset.Rid[]) {
                const before = previous[datasetRid];

                if (!before || !isDeepStrictEqual(Forge.Recipe.getComputation(before, datasetRid), Forge.Recipe.getComputation(recipe, datasetRid)))
                    changes.push({ datasetRid, branch, producerRid, recipeRid: recipe.rid });
            }

        for (const datasetRid of Object.keys(previous) as Dataset.Rid[])
            if (!outputRids.has(datasetRid))
                changes.push({ datasetRid, branch, producerRid, recipeRid: null });

        await this.durableRecipeChangedEvent.publish(changes.map((payload) => ({ payload, eventId: Foundations.uuidv7() })));

        return published;
    }

    /** The recipe computing the dataset on the first of `branches` that has one; null if none does. */
    @Transactional()
    public async getCurrent(
        principal:  Principal,
        datasetRid: Dataset.Rid,
        branches:   Foundations.Branch[],
    ): Promise<Forge.Recipe | null> {
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
    public async get(principal: Principal, rid: Forge.Recipe.Rid): Promise<Forge.Recipe | null> {
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
            .select(['dataset_rid', 'transaction'])
            .where('recipe_rid', '=', rid)
            .execute();

        const outputTransactions: Forge.Recipe['outputTransactions'] = {};

        for (const output of outputs)
            outputTransactions[output.dataset_rid] = output.transaction;

        return ForgeDB.Recipe.toDomain(row, inputs.map((input) => input.dataset_rid), outputTransactions);
    }

    // ── helpers ─────────────────────────────────────────────────────────

    /** The recipe, its datasets, and a pointer from each output. */
    private async insert(
        principal:   Principal,
        producerRid: Library.Resource.Rid,
        branch:      Foundations.Branch,
        recipe:        PublishedRecipe,
    ): Promise<Forge.Recipe> {
        const rid = Forge.Recipe.createRid();

        const row = await this.trx
            .insertInto('forge.recipe')
            .values({
                rid,
                producer_rid: producerRid,
                branch,
                runtime_config: json(recipe.runtimeConfig),
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

        const outputs = Object.keys(recipe.outputTransactions) as Dataset.Rid[];

        await this.trx
            .insertInto('forge.recipe_output_dataset')
            .values(outputs.map((datasetRid) => ({ recipe_rid: rid, dataset_rid: datasetRid, transaction: json(recipe.outputTransactions[datasetRid]) })))
            .execute();

        await this.trx
            .insertInto('forge.current_recipe')
            .values(outputs.map((datasetRid) => ({ dataset_rid: datasetRid, branch, recipe_rid: rid })))
            .execute();

        return ForgeDB.Recipe.toDomain(row, recipe.inputDatasetRids, recipe.outputTransactions);
    }

    /**
     * One producer per dataset per branch. The pointer's primary key enforces it;
     * this names the producer when the caller can see it.
     */
    private async requireUnowned(producerRid: Library.Resource.Rid, branch: Foundations.Branch, outputs: Dataset.Rid[]): Promise<void> {
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
