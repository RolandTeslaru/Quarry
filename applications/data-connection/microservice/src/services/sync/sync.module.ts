import { Module } from '@nestjs/common';
import { CatalogClient, ForgeClient } from '@quarry/platform-kernel/microservice/clients';
import { SourceModule } from '../source/source.module';
import { PublisherService } from '../publisher/publisher.service';
import { SyncService } from './sync.service';
import { SyncRepository } from './sync.repository';

/** Syncs; their output datasets are Catalog's (CatalogClient), their recipes Forge's (ForgeClient). */
@Module({
    imports:   [SourceModule],
    providers: [CatalogClient, ForgeClient, SyncService, SyncRepository, PublisherService],
    exports:   [SyncService],
})
export class SyncModule {}
