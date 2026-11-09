import { Module } from '@nestjs/common';
import { Forge } from '@quarry/shared/domain';
import { DurableModule } from '@quarry/platform-kernel/infra/durable';
import { CatalogClient, IdentityClient } from '@quarry/platform-kernel/microservice/clients';
import { LibraryModule } from '@quarry/platform-kernel/services/Library/library.module';
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
    imports:   [
        LibraryModule,
        DurableModule.registerQueue(Forge.DurableQueue.RunJob),
        DurableModule.registerEvent(Forge.DurableEvent.RecipeChanged, Forge.DurableEvent.JobSucceeded, Forge.DurableEvent.JobFailed),
    ],
    providers: [ForgeService, JobService, RecipeService, ForgeRepository, BuildRepository, JobRepository, RecipeRepository, CatalogClient, IdentityClient],
    exports:   [ForgeService, JobService, RecipeService],
})
export class ForgeModule {}
