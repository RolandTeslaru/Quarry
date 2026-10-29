import { Module } from '@nestjs/common';
import { LibraryModule } from '@/services/Library/library.module';
import { CatalogService } from './catalog.service';
import { CatalogStorage } from './storage/catalog-storage.service';
import { DuckDb } from './storage/duckdb';
import { DatasetTransactions } from './transaction/dataset-transactions';
import { DatasetRepository } from './dataset.repository';
import { TransactionRepository } from './transaction/transaction.repository';

/**
 * Providers only; controllers are registered by api.module. Other services
 * use CatalogService only (writes: catalog.transaction; uploads and previews: catalog.storage).
 */
@Module({
    imports:   [LibraryModule],
    providers: [CatalogService, DatasetTransactions, CatalogStorage, DuckDb, DatasetRepository, TransactionRepository],
    exports:   [CatalogService],
})
export class CatalogModule {}
