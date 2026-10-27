import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Forge } from '@quarry/shared/domain';
import { Internal } from '@/auth/current-principal';
import { ZodPipe } from '@/http/zod.pipe';
import { ForgeRelayService } from './relay/forge-relay.service';

import API = Forge.API;

/**
 * System-worker-only (`/api/internal/forge/…`, service token): Forge's
 * housekeeping. Mirrors Forge.API.Internal in @quarry/shared.
 */
@Internal()
@Controller('internal/forge')
export class ForgeInternalController {

    constructor(private readonly relay: ForgeRelayService) {}

    @Post('relay-sweep')
    @HttpCode(200)
    public async relaySweep(@Body(new ZodPipe(API.Internal.RelaySweep.Request)) body: API.Internal.RelaySweep.Request): Promise<API.Internal.RelaySweep.Response> {
        return { relayed: await this.relay.sweep(body.staleQueuedMinutes) };
    }
}
