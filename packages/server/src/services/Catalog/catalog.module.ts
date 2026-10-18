import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { DatasetTransactions } from './transaction/dataset-transactions';
import { DatasetRepository } from './dataset.repository';
import { TransactionRepository } from './transaction/transaction.repository';
import { OutboxRepository } from './outbox/outbox.repository';

/**
 * Providers only. Controllers are registered by api.module, processors by the
 * worker modules — which is why the repositories the processors need are
 * exported here. Other services use CatalogService only (writes: catalog.transaction).
 */
@Module({
    providers: [CatalogService, DatasetTransactions, DatasetRepository, TransactionRepository, OutboxRepository],
    exports:   [CatalogService, TransactionRepository, OutboxRepository],
})
export class CatalogModule {}
