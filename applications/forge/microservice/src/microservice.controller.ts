import { Controller } from '@nestjs/common';
import { Forge } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { MicroserviceCall } from '@quarry/platform-kernel/microservice/microservice-call.decorator';
import { MicroserviceCallReceiver } from '@quarry/platform-kernel/microservice/microservice-call-receiver';
import { ForgeService } from './services/forge/forge.service';
import { JobService } from './services/job/job.service';
import { RecipeService } from './services/recipe/recipe.service';

import Calls = Forge.Microservice;

/**
 * What Forge serves other services (docs/design/architecture-split.md §8) — Forge.Microservice.Calls,
 * each as the user the caller acts for, so RLS decides as on a request.
 */
@Controller()
export class ForgeMicroserviceController {

    constructor(
        readonly microserviceCalls: MicroserviceCallReceiver,
        private readonly forge:     ForgeService,
        private readonly jobs:      JobService,
        private readonly recipes:   RecipeService,
    ) {}

    /** The realtime gateway's check on a build's channel: whether the user sees the build. */
    @MicroserviceCall(Calls.GetBuild, { from: ['main'] })
    public getBuild(principal: Principal, request: Calls.GetBuild.Request) {
        return this.forge.getBuild(principal, request.rid);
    }

    @MicroserviceCall(Calls.GetJob, { from: ['data-connection'] })
    public async getJob(principal: Principal, request: Calls.GetJob.Request) {
        const job = await this.jobs.getJob(principal, request.rid);

        return { job, recipe: await this.recipes.get(principal, job.recipeRid) };
    }

    /** A producer publishing its recipes on a branch: a workspace's passing check run as its pusher, a source's syncs. */
    @MicroserviceCall(Calls.PublishRecipes, { from: ['code-workspace', 'data-connection'] })
    public publishRecipes(principal: Principal, request: Calls.PublishRecipes.Request) {
        return this.recipes.publish(principal, request.producerRid, request.branch, request.recipes);
    }
}
