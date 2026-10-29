import { Injectable } from '@nestjs/common';
import { Catalog, CodeWorkspace, Forge } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { CatalogService } from '@/services/Catalog/catalog.service';
import { ForgeService } from '@/services/Forge/forge.service';
import type { PublishedRecipe } from '@/services/Forge/recipes';

import CI = CodeWorkspace.CI;

/** A passing run's manifest → its branch's recipes, as the pusher. Missing outputs are created empty. */
@Injectable()
export class CheckPublisher {

    constructor(
        private readonly catalog: CatalogService,
        private readonly forge:   ForgeService,
    ) {}

    public async publish(run: CI.CheckRun.Schema, rawManifest: unknown): Promise<Forge.Recipe.Schema[]> {
        const manifest = CI.Check.Manifest.Schema.parse(rawManifest);
        const principal = Principal.delegate(run.pushedBy!, `check-run:${run.rid}`);
        const recipes: PublishedRecipe[] = [];

        for (const transform of manifest.transforms) {
            const inputDatasetRids: Catalog.Dataset.Rid[] = [];
            const outputDatasetRids: Catalog.Dataset.Rid[] = [];

            for (const reference of Object.values(transform.inputs)) {
                const dataset = await this.catalog.getByReference(principal, reference);

                if (!inputDatasetRids.includes(dataset.rid))
                    inputDatasetRids.push(dataset.rid);
            }

            for (const reference of Object.values(transform.outputs)) {
                const dataset = await this.catalog.getOrCreateByReference(principal, reference);

                outputDatasetRids.push(dataset.rid);
            }

            recipes.push({
                driver: {
                    type:         'code-workspace',
                    workspaceRid: run.workspaceRid,
                    commit:       run.commit,
                    transform:    transform.name,
                },
                inputDatasetRids,
                outputDatasetRids,
                compute: transform.resources,
            });
        }

        return this.forge.recipes.publish(principal, run.workspaceRid, run.branch, recipes);
    }
}
