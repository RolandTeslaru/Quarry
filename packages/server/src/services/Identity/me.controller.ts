import { Controller, Get } from '@nestjs/common';
import { Identity } from '@quarry/shared/domain';
import { CurrentPrincipal } from '@/auth/current-principal';
import { Principal } from '@/auth/principal';
import { IdentityService } from './identity.service';

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
