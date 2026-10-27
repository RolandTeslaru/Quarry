import { Module } from '@nestjs/common';
import { CatalogModule } from '@/services/Catalog/catalog.module';
import { ForgeService } from './forge.service';
import { ForgeRepository } from './forge.repository';
import { JobSpecs } from './job-specs';

/**
 * Providers only; controllers are registered by api.module. Other services
 * use ForgeService only (publishing job specs: forge.jobSpecs).
 */
@Module({
    imports:   [CatalogModule],
    providers: [ForgeService, JobSpecs, ForgeRepository],
    exports:   [ForgeService],
})
export class ForgeModule {}
