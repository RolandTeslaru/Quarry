import { Module } from '@nestjs/common';
import { CatalogModule } from '@/services/Catalog/catalog.module';
import { ForgeService } from './forge.service';
import { ForgeRelayService } from './relay/forge-relay.service';
import { ForgeAgentService } from './agent/forge-agent.service';
import { ForgeRepository } from './forge.repository';
import { JobSpecs } from './job-specs';

/**
 * Providers only; controllers are registered by api.module. Other services
 * use ForgeService only (publishing job specs: forge.jobSpecs); ForgeAgentService
 * and ForgeRelayService are exported for their controllers alone.
 */
@Module({
    imports:   [CatalogModule],
    providers: [ForgeService, JobSpecs, ForgeRepository, ForgeRelayService, ForgeAgentService],
    exports:   [ForgeService, ForgeAgentService, ForgeRelayService],
})
export class ForgeModule {}
