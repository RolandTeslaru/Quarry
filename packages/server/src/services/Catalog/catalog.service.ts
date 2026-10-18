import { Injectable, NotFoundException } from '@nestjs/common';
import type { z } from 'zod';
import { Catalog, Library } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { GatekeeperService } from '@/services/Gatekeeper/gatekeeper.service';
import { SecurityGate } from '@/services/Gatekeeper/security-gate';
import { DatasetRepository } from './dataset.repository';
import { DatasetTransactions } from './transaction/dataset-transactions';
import { TransactionRepository } from './transaction/transaction.repository';

/**
 * Catalog's one entry point for other services: datasets here, their write
 * protocol under `transaction` (catalog.transaction.open / registerChanges /
 * commit / abort).
 */
@Injectable()
export class CatalogService {

    constructor(
        readonly gatekeeper:                    GatekeeperService,
        readonly transaction:                   DatasetTransactions,
        private readonly datasetRepository:     DatasetRepository,
        private readonly transactionRepository: TransactionRepository,
    ) {}

    /** Creating = writing into the parent folder. */
    @SecurityGate('write')
    async createDataset(principal: Principal, parentRid: Library.Resource.Rid, request: Omit<z.output<typeof Catalog.API.Dataset.Create.Request>, 'parentRid'>): Promise<Catalog.Dataset.Schema> {
        return this.datasetRepository.create(principal, {
            rid:         Catalog.Dataset.createRid(),
            name:        request.name,
            description: request.description,
            parentRid,
        });
    }

    @SecurityGate('discover')
    async get(principal: Principal, rid: Catalog.Dataset.Rid): Promise<Catalog.Dataset.Schema> {
        const dataset = await this.datasetRepository.get(principal, rid);

        if (!dataset)
            throw new NotFoundException('Not found');

        return dataset;
    }

    @SecurityGate('read')
    async view(principal: Principal, rid: Catalog.Dataset.Rid, sequence?: number): Promise<Catalog.Dataset.View.Schema> {
        await this.get(principal, rid);

        return this.transactionRepository.resolveView(principal, rid, 'main', sequence);
    }
}
