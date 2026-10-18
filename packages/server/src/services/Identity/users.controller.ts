import { Controller, Get } from '@nestjs/common';
import { Identity } from '@quarry/shared/domain';
import { CurrentPrincipal } from '@/auth/current-principal';
import { Principal } from '@/auth/principal';
import { IdentityService } from './identity.service';

import API = Identity.API;

/** Mirrors Identity.API.Users / Identity.API.Groups in @quarry/shared. */
@Controller()
export class UsersController {

    constructor(private readonly identity: IdentityService) {}

    @Get('users')
    async listUsers(@CurrentPrincipal() principal: Principal.User): Promise<API.Users.List.Response> {
        return { users: await this.identity.listUsers(principal) };
    }

    @Get('groups')
    async listGroups(@CurrentPrincipal() principal: Principal.User): Promise<API.Groups.List.Response> {
        return { groups: await this.identity.listGroups(principal) };
    }
}
