import { Module } from '@nestjs/common';
import { CatalogClient, IdentityClient } from '@quarry/platform-kernel/microservice/clients';
import { ForgeModule } from '../forge/forge.module';
import { JobService } from './job.service';

/** Jobs — for users (JobController) and their runtimes (JobRuntimeController), both registered by microservice.module — through ForgeModule's exported ForgeRepository. Datasets are Catalog's (CatalogClient). */
@Module({
    imports:   [ForgeModule],
    providers: [JobService, CatalogClient, IdentityClient],
    exports:   [JobService],
})
export class JobModule {}
