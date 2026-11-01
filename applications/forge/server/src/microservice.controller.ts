import { Controller } from '@nestjs/common';
import { Forge } from '@quarry/shared/domain';
import type { Principal } from '@quarry/platform-kernel/auth/principal';
import { MicroserviceCall } from '@quarry/platform-kernel/microservice/microservice-call.decorator';
import { MicroserviceCallReceiver } from '@quarry/platform-kernel/microservice/microservice-call-receiver';
import { ForgeService } from './services/forge/forge.service';
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
        private readonly recipes:   RecipeService,
    ) {}

    /** The realtime gateway's check on a build's channel: whether the user sees the build. */
    @MicroserviceCall(Calls.GetBuild, { from: ['main'] })
    public getBuild(principal: Principal, request: Calls.GetBuild.Request) {
        return this.forge.getBuild(principal, request.rid);
    }

    /** A workspace's passing check run publishing its branch's recipes, as the pusher. */
    @MicroserviceCall(Calls.PublishRecipes, { from: ['code-workspace'] })
    public publishRecipes(principal: Principal, request: Calls.PublishRecipes.Request) {
        return this.recipes.publish(principal, request.producerRid, request.branch, request.recipes);
    }
}
