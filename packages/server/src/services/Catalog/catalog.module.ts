import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { DatasetTransactions } from './transaction/dataset-transactions';
import { DatasetRepository } from './dataset.repository';
import { TransactionRepository } from './transaction/transaction.repository';
import { OutboxRepository } from './outbox/outbox.repository';

/**
 * Providers only; controllers are registered by api.module. Other services
 * use CatalogService only (writes: catalog.transaction).
 */
@Module({
    providers: [CatalogService, DatasetTransactions, DatasetRepository, TransactionRepository, OutboxRepository],
    exports:   [CatalogService],
})
export class CatalogModule {}
