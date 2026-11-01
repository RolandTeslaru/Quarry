import { Module } from '@nestjs/common';
import { Forge } from '@quarry/shared/domain';
import { DurableQueueModule } from '@quarry/platform-kernel/infra/durable-queue';
import { CatalogClient, IdentityClient } from '@quarry/platform-kernel/microservice/clients';
import { ForgeService } from './forge.service';
import { ForgeRepository } from './repository/forge.repository';
import { BuildRepository } from './repository/build.repository';
import { JobRepository } from '../job/job.repository';
import { RecipeRepository } from '../recipe/recipe.repository';
import { RecipeService } from '../recipe/recipe.service';
import { JobService } from '../job/job.service';

/**
 * Forge's three concepts in one module: ForgeRepository's writes span builds and jobs, and
 * ForgeService reads jobs through JobService and recipes through RecipeService.
 * Providers only; controllers are registered by microservice.module. Other services use ForgeService
 * (publishing recipes: forge.recipes). Datasets are Catalog's (CatalogClient), tokens the main server's (IdentityClient).
 */
@Module({
    imports:   [DurableQueueModule.registerQueue(Forge.DurableQueue.RunJob)],
    providers: [ForgeService, JobService, RecipeService, ForgeRepository, BuildRepository, JobRepository, RecipeRepository, CatalogClient, IdentityClient],
    exports:   [ForgeService, JobService, RecipeService],
})
export class ForgeModule {}
