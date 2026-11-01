import { Module } from '@nestjs/common';
import { Forge } from '@quarry/shared/domain';
import { DurableQueueModule } from '@quarry/platform-kernel/infra/durable-queue';
import { CatalogClient } from '@quarry/platform-kernel/microservice/clients';
import { ForgeService } from './forge.service';
import { ForgeRepository } from './repository/forge.repository';
import { BuildRepository } from './repository/build.repository';
import { JobRepository } from './repository/job.repository';
import { RecipeRepository } from './repository/recipe.repository';
import { RecipeService } from '../recipe/recipe.service';

/**
 * Providers only; controllers are registered by microservice.module. Other services
 * use ForgeService only (publishing recipes: forge.recipes); ForgeRepository and RecipeService
 * are exported for JobService (JobModule): claiming a job reads its recipe and build.
 * Datasets are Catalog's (CatalogClient).
 */
@Module({
    imports:   [DurableQueueModule.registerQueue(Forge.DurableQueue.RunJob)],
    providers: [ForgeService, RecipeService, ForgeRepository, BuildRepository, JobRepository, RecipeRepository, CatalogClient],
    exports:   [ForgeService, ForgeRepository, RecipeService],
})
export class ForgeModule {}
