import { Injectable } from '@nestjs/common';
import { type DataConnection, type Forge, Foundations } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { ForgeClient } from '@quarry/platform-kernel/microservice/clients';
import { syncDefinition } from '../sync/sync-definition';
import { SyncRepository } from '../sync/sync.repository';

/** What a sync's job gets: copying is mostly waiting on the source and storage. */
const SYNC_COMPUTE: Forge.Recipe.Compute = { cpuCores: 1, memoryGb: 2 };

/** A source's enabled syncs → its recipes on main: no inputs, each sync's dataset as the output. */
@Injectable()
export class PublisherService {

    constructor(
        private readonly syncs: SyncRepository,
        private readonly forge: ForgeClient,
    ) {}

    /** Forge replaces everything a producer publishes on a branch, so this is always all of the source's syncs. */
    public async publish(principal: Principal, source: DataConnection.Source): Promise<void> {
        const definition = syncDefinition(source);
        const recipes: Forge.Microservice.PublishRecipes.Request['recipes'] = [];

        for (const sync of await this.syncs.listForSource(principal, source.rid)) {
            if (!sync.enabled)
                continue;

            const outputTransaction: Forge.Recipe.OutputTransaction = definition.transactionType(sync.config) === 'append'
                ? { type: 'append', incrementalColumn: definition.incrementalColumn(sync.config) }
                : { type: 'snapshot' };

            recipes.push({
                runtimeConfig:      { type: 'data-connection', sourceRid: source.rid, syncRid: sync.rid, syncConfig: sync.config },
                inputDatasetRids:   [],
                outputTransactions: { [sync.output_dataset_rid]: outputTransaction },
                compute:            SYNC_COMPUTE,
            });
        }

        await this.forge.publishRecipes(principal, { producerRid: source.rid, branch: Foundations.MAIN_BRANCH, recipes });
    }
}
