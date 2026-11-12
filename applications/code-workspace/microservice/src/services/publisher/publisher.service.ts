import { Injectable } from '@nestjs/common';
import { CodeWorkspace, Dataset, Forge } from '@quarry/shared/domain';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { CatalogClient, ForgeClient } from '@quarry/platform-kernel/microservice/clients';

import CI = CodeWorkspace.CI;

/** A passing run's manifest → its branch's recipes, as the pusher. Missing outputs are created empty. */
@Injectable()
export class PublisherService {

    constructor(
        private readonly catalog: CatalogClient,
        private readonly forge:   ForgeClient,
    ) {}

    public async publish(run: CI.CheckRun, rawManifest: unknown): Promise<Forge.Recipe[]> {
        const manifest = CI.Check.Manifest.Schema.parse(rawManifest);
        const principal = Principal.delegate(run.pushedBy!, `check-run:${run.rid}`);
        const recipes: Forge.Microservice.PublishRecipes.Request["recipes"] = [];

        for (const transform of manifest.transforms) {
            const inputs: Record<string, Dataset.Rid> = {};
            const outputs: Record<string, Dataset.Rid> = {};
            const inputDatasetRids: Dataset.Rid[] = [];
            const recipeOutputs: Forge.Recipe['outputs'] = {};

            for (const [parameter, reference] of Object.entries(transform.inputs)) {
                const dataset = await this.catalog.getByReference(principal, { reference });

                inputs[parameter] = dataset.rid;

                if (!inputDatasetRids.includes(dataset.rid))
                    inputDatasetRids.push(dataset.rid);
            }

            for (const [parameter, reference] of Object.entries(transform.outputs)) {
                const dataset = await this.catalog.getOrCreateByReference(principal, { reference });

                outputs[parameter] = dataset.rid;
                recipeOutputs[dataset.rid] = { kind: 'dataset', transaction: { type: 'snapshot' } };
            }

            recipes.push({
                runtimeConfig: {
                    type:         'code-workspace',
                    workspaceRid: run.workspaceRid,
                    commit:       run.commit,
                    transform:    transform.name,
                    inputs,
                    outputs,
                },
                inputDatasetRids,
                outputs: recipeOutputs,
                compute: transform.resources,
            });
        }

        return this.forge.publishRecipes(principal, { producerRid: run.workspaceRid, branch: run.branch, recipes });
    }
}
