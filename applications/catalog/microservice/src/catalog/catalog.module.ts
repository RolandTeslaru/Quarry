import { Module } from '@nestjs/common';
import { LibraryModule } from '@quarry/platform-kernel/services/Library/library.module';
import { TransactionModule } from '../transaction/transaction.module';
import { CatalogService } from './catalog.service';
import { CatalogStorage } from './storage/catalog-storage.service';
import { DuckDb } from './storage/duckdb';
import { DatasetRepository } from './dataset.repository';

/**
 * Providers only; controllers are registered by microservice.module. Other services
 * use CatalogService (uploads and previews: catalog.storage); writes go through
 * TransactionModule's TransactionService.
 */
@Module({
    imports:   [LibraryModule, TransactionModule],
    providers: [CatalogService, CatalogStorage, DuckDb, DatasetRepository],
    exports:   [CatalogService],
})
export class CatalogModule {}
