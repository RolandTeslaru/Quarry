import { Injectable } from '@nestjs/common';
import { Catalog, CodeWorkspace, Dataset, Forge } from '@quarry/shared/domain';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { CatalogService } from '@quarry/catalog-server/catalog/catalog.service';
import { ForgeService } from '@quarry/forge-server/services/forge/forge.service';
import type { PublishedRecipe } from '@quarry/forge-server/services/recipe/recipe.service';

import CI = CodeWorkspace.CI;

/** A passing run's manifest → its branch's recipes, as the pusher. Missing outputs are created empty. */
@Injectable()
export class CheckPublisher {

    constructor(
        private readonly catalog: CatalogService,
        private readonly forge:   ForgeService,
    ) {}

    public async publish(run: CI.CheckRun, rawManifest: unknown): Promise<Forge.Recipe[]> {
        const manifest = CI.Check.Manifest.Schema.parse(rawManifest);
        const principal = Principal.delegate(run.pushedBy!, `check-run:${run.rid}`);
        const recipes: PublishedRecipe[] = [];

        for (const transform of manifest.transforms) {
            const inputs: Record<string, Dataset.Rid> = {};
            const outputs: Record<string, Dataset.Rid> = {};
            const inputDatasetRids: Dataset.Rid[] = [];
            const outputDatasetRids: Dataset.Rid[] = [];

            for (const [parameter, reference] of Object.entries(transform.inputs)) {
                const dataset = await this.catalog.getByReference(principal, reference);

                inputs[parameter] = dataset.rid;

                if (!inputDatasetRids.includes(dataset.rid))
                    inputDatasetRids.push(dataset.rid);
            }

            for (const [parameter, reference] of Object.entries(transform.outputs)) {
                const dataset = await this.catalog.getOrCreateByReference(principal, reference);

                outputs[parameter] = dataset.rid;
                outputDatasetRids.push(dataset.rid);
            }

            recipes.push({
                runtime: {
                    type:         'code-workspace',
                    workspaceRid: run.workspaceRid,
                    commit:       run.commit,
                    transform:    transform.name,
                    inputs,
                    outputs,
                },
                inputDatasetRids,
                outputDatasetRids,
                compute: transform.resources,
            });
        }

        return this.forge.recipes.publish(principal, run.workspaceRid, run.branch, recipes);
    }
}
