import { Module } from '@nestjs/common';
import { CatalogModule } from '@/services/Catalog/catalog.module';
import { ForgeService } from './forge.service';
import { BuildRepository } from './build/build.repository';
import { JobSpecs } from './job-spec/job-specs';
import { JobSpecRepository } from './job-spec/job-spec.repository';

/**
 * Providers only; controllers are registered by api.module. Other services
 * use ForgeService only (publishing job specs: forge.jobSpecs).
 */
@Module({
    imports:   [CatalogModule],
    providers: [ForgeService, JobSpecs, JobSpecRepository, BuildRepository],
    exports:   [ForgeService],
})
export class ForgeModule {}
