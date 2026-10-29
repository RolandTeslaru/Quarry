import { Module } from '@nestjs/common';
import { Forge } from '@quarry/shared/domain';
import { SessionTokens } from '@/auth/session-tokens';
import { DurableQueueModule } from '@/infra/durable-queue';
import { CatalogModule } from '@/services/Catalog/catalog.module';
import { ForgeService } from './forge.service';
import { ForgeAgentService } from './agent/forge-agent.service';
import { ForgeRepository } from './repository/forge.repository';
import { BuildRepository } from './repository/build.repository';
import { JobRepository } from './repository/job.repository';
import { RecipeRepository } from './repository/recipe.repository';
import { Recipes } from './recipes';

/**
 * Providers only; controllers are registered by api.module. Other services
 * use ForgeService only (publishing recipes: forge.recipes); ForgeAgentService
 * is exported for its controller alone.
 */
@Module({
    imports:   [CatalogModule, DurableQueueModule.registerQueue(Forge.DurableQueue.RunJob)],
    providers: [ForgeService, Recipes, ForgeRepository, BuildRepository, JobRepository, RecipeRepository, ForgeAgentService, SessionTokens],
    exports:   [ForgeService, ForgeAgentService],
})
export class ForgeModule {}
