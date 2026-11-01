import { Module } from '@nestjs/common';
import { CatalogClient } from '@quarry/platform-kernel/microservice/clients';
import { SourceModule } from '../source/source.module';
import { SyncModule } from '../sync/sync.module';
import { SyncRunService } from './sync-run.service';
import { SyncRunRepository } from './sync-run.repository';

/** A sync's runs: the lifecycle the Data Connection worker drives through /internal, and their history. */
@Module({
    imports:   [SourceModule, SyncModule],
    providers: [CatalogClient, SyncRunService, SyncRunRepository],
    exports:   [SyncRunService],
})
export class SyncRunModule {}
