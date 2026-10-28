import { Module } from '@nestjs/common';
import { Forge } from '@quarry/shared/domain';
import { DurableQueueModule } from '@/infra/durable-queue';
import { CatalogModule } from '@/services/Catalog/catalog.module';
import { ForgeService } from './forge.service';
import { ForgeAgentService } from './agent/forge-agent.service';
import { ForgeRepository } from './repository/forge.repository';
import { BuildRepository } from './repository/build.repository';
import { JobRepository } from './repository/job.repository';
import { JobSpecRepository } from './repository/job-spec.repository';
import { JobSpecs } from './job-specs';

/**
 * Providers only; controllers are registered by api.module. Other services
 * use ForgeService only (publishing job specs: forge.jobSpecs); ForgeAgentService
 * is exported for its controller alone.
 */
@Module({
    imports:   [CatalogModule, DurableQueueModule.registerQueue(Forge.DurableQueue.RunJob)],
    providers: [ForgeService, JobSpecs, ForgeRepository, BuildRepository, JobRepository, JobSpecRepository, ForgeAgentService],
    exports:   [ForgeService, ForgeAgentService],
})
export class ForgeModule {}
