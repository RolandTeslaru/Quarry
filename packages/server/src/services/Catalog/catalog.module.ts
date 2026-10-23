import { Module } from '@nestjs/common';
import { LibraryModule } from '@/services/Library/library.module';
import { CatalogService } from './catalog.service';
import { DatasetFiles } from './files/dataset-files';
import { DuckDb } from './files/duckdb';
import { DatasetTransactions } from './transaction/dataset-transactions';
import { DatasetRepository } from './dataset.repository';
import { TransactionRepository } from './transaction/transaction.repository';
import { OutboxRepository } from './outbox/outbox.repository';

/**
 * Providers only; controllers are registered by api.module. Other services
 * use CatalogService only (writes: catalog.transaction; uploads and previews: catalog.files).
 */
@Module({
    imports:   [LibraryModule],
    providers: [CatalogService, DatasetTransactions, DatasetFiles, DuckDb, DatasetRepository, TransactionRepository, OutboxRepository],
    exports:   [CatalogService],
})
export class CatalogModule {}
