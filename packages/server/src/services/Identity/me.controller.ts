import { Controller, Get } from '@nestjs/common';
import { Identity } from '@quarry/shared/domain';
import { CurrentPrincipal } from '@quarry/platform-server/auth/current-principal';
import { Principal } from '@quarry/platform-server/auth/principal';
import { IdentityService } from '@quarry/platform-server/services/Identity/identity.service';

import API = Identity.API;

/** Mirrors Identity.API.Me in @quarry/shared. */
@Controller('me')
export class MeController {

    constructor(private readonly identity: IdentityService) {}

    @Get()
    async get(@CurrentPrincipal() principal: Principal.User): Promise<API.Me.Get.Response> {
        return { user: await this.identity.me(principal) };
    }
}
