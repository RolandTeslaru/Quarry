import { Module } from '@nestjs/common';
import { CatalogClient } from '@quarry/platform-kernel/microservice/clients';
import { SourceModule } from '../source/source.module';
import { SyncService } from './sync.service';
import { SyncRepository } from './sync.repository';

/** Syncs; their output datasets are Catalog's (CatalogClient). SyncRepository is exported for SyncRunService alone: a run loads its sync as the system. */
@Module({
    imports:   [SourceModule],
    providers: [CatalogClient, SyncService, SyncRepository],
    exports:   [SyncService, SyncRepository],
})
export class SyncModule {}
