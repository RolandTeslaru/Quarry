import { Controller, Get } from '@nestjs/common';
import { Identity } from '@quarry/shared/domain';
import { CurrentPrincipal } from '@quarry/platform-kernel/auth/current-principal';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { IdentityService } from '@quarry/platform-kernel/services/Identity/identity.service';

import API = Identity.API;

/** Mirrors Identity.API.Me / Identity.API.Users / Identity.API.Groups in @quarry/shared. */
@Controller()
export class IdentityController {

    constructor(private readonly identity: IdentityService) {}

    @Get('me')
    async getMe(@CurrentPrincipal() principal: Principal.User): Promise<API.Me.Get.Response> {
        return { user: await this.identity.me(principal) };
    }

    @Get('users')
    async listUsers(@CurrentPrincipal() principal: Principal.User): Promise<API.Users.List.Response> {
        return { users: await this.identity.listUsers(principal) };
    }

    @Get('groups')
    async listGroups(@CurrentPrincipal() principal: Principal.User): Promise<API.Groups.List.Response> {
        return { groups: await this.identity.listGroups(principal) };
    }
}
