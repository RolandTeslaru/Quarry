import { isDeepStrictEqual } from 'node:util';
import { Injectable } from '@nestjs/common';
import { Dataset, Forge, Foundations, Library } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { CatalogClient } from '@quarry/platform-kernel/microservice/clients';
import { LibraryService } from '@quarry/platform-kernel/services/Library/library.service';
import { JobService } from '../job/job.service';
import { RecipeService } from '../recipe/recipe.service';

/**
 * Whether datasets are what their recipes would compute now (`Library.Lineage.Staleness`). Worked out on
 * each read, never stored: over the datasets' lineage, from each one's current recipe, its newest version
 * (Catalog), and the job that wrote it — its recipe and the input versions it read. Reached as `forge.staleness`.
 */
@Injectable()
export class StalenessService {

    constructor(
        private readonly recipes: RecipeService,
        private readonly jobs:    JobService,
        private readonly catalog: CatalogClient,
        private readonly library: LibraryService,
    ) {}

    /**
     * The datasets' staleness, measured against everything upstream of them: their lineage on the first of
     * `branches`, each one's recipe on the first of `branches` with one — as a build finds them.
     */
    public async get(principal: Principal, datasetRids: Dataset.Rid[], branches: Foundations.Branch[]): Promise<Record<Dataset.Rid, Library.Lineage.Staleness>> {
        // 1. The datasets and everything feeding them: their lineage, all the way up.
        const graph = await this.library.lineage.getUpstreamOfMany(principal, datasetRids, branches[0], Library.Lineage.Walk.ALL_THE_WAY);
        const datasets: Dataset.Rid[] = [];

        for (const resource of Object.values(graph.resources))
            if (resource.type === 'dataset')
                datasets.push(resource.rid as Dataset.Rid);

        // 2. Each one's current recipe and newest version, and — for one a recipe builds — the job that wrote it, with that job's recipe.
        const recipes = await this.recipes.forDataset.getMany(principal, datasets, branches);
        const latest = await this.catalog.getLatestTransactions(principal, { datasetRids: datasets });
        const writtenBy: Record<Dataset.Rid, Forge.Job.Rid> = {};
        const writers: Record<Dataset.Rid, { job: Forge.Job; recipe: Forge.Recipe }> = {};

        for (const datasetRid of datasets) {
            const jobRid = Forge.Job.Rid.safeParse(latest[datasetRid]?.provenance.jobRid);

            if (recipes[datasetRid] && jobRid.success)
                writtenBy[datasetRid] = jobRid.data;
        }

        const jobs = await this.jobs.getJobs(principal, Object.values(writtenBy));
        const writerRecipeRids: Forge.Recipe.Rid[] = [];

        for (const job of Object.values(jobs))
            writerRecipeRids.push(job.recipeRid);

        const writerRecipes = await this.recipes.getMany(principal, writerRecipeRids);

        for (const datasetRid of Object.keys(writtenBy) as Dataset.Rid[]) {
            const job = jobs[writtenBy[datasetRid]];

            if (job)
                writers[datasetRid] = { job, recipe: writerRecipes[job.recipeRid] };
        }

        // 3. Each one's own reasons, against its recipe and its inputs' newest versions. What no recipe builds has none.
        const reasons: Record<Library.Resource.Rid, Library.Lineage.Staleness.Reason[]> = {};
        const changedInputs: Record<Library.Resource.Rid, Dataset.Rid[]> = {};

        for (const rid of Object.keys(graph.resources) as Library.Resource.Rid[]) {
            reasons[rid] = [];
            changedInputs[rid] = [];
        }

        for (const datasetRid of datasets) {
            const recipe = recipes[datasetRid];
            const writer = writers[datasetRid];

            if (!recipe)
                continue;

            if (!writer) {
                reasons[datasetRid].push('never-built');
                continue;
            }

            if (!isDeepStrictEqual(Forge.Recipe.getComputation(writer.recipe, datasetRid), Forge.Recipe.getComputation(recipe, datasetRid)))
                reasons[datasetRid].push('logic-changed');

            // Its own output read back isn't an input that moved; an input it didn't read then is new logic, caught above.
            for (const inputRid of recipe.inputDatasetRids) {
                if (recipe.outputTransactions[inputRid])
                    continue;

                const read = writer.job.inputs?.[inputRid];

                if (read !== undefined && read !== latest[inputRid]?.sequence)
                    changedInputs[datasetRid].push(inputRid);
            }

            if (changedInputs[datasetRid].length > 0)
                reasons[datasetRid].push('inputs-changed');
        }

        // 4. How far up each one's nearest stale dataset is.
        const distances = Library.Lineage.Staleness.getDistances(graph, reasons);
        const staleness: Record<Dataset.Rid, Library.Lineage.Staleness> = {};

        for (const datasetRid of datasetRids)
            staleness[datasetRid] = { reasons: reasons[datasetRid], changedInputs: changedInputs[datasetRid], distance: distances[datasetRid] };

        return staleness;
    }
}
