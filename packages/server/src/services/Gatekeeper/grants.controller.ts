import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { Gatekeeper, Library } from '@quarry/shared/domain';
import { CurrentPrincipal } from '@/auth/current-principal';
import { Principal } from '@/auth/principal';
import { ZodPipe } from '@/http/zod.pipe';
import { GatekeeperService } from './gatekeeper.service';

import API = Gatekeeper.API;
const RidParam = new ZodPipe(Library.Resource.Rid);

/** Mirrors Gatekeeper.API in @quarry/shared. */
@Controller('resources/:rid/grants')
export class GrantsController {

    constructor(private readonly gatekeeper: GatekeeperService) {}

    @Get()
    async list(@CurrentPrincipal() principal: Principal.User, @Param('rid', RidParam) rid: Library.Resource.Rid): Promise<API.Grant.List.Response> {
        return { grants: await this.gatekeeper.listGrants(principal, rid) };
    }

    @Put()
    async put(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', RidParam) rid: Library.Resource.Rid,
        @Body(new ZodPipe(API.Grant.Put.Request)) body: API.Grant.Put.Request,
    ): Promise<API.Grant.Put.Response> {
        return { grant: await this.gatekeeper.grant(principal, rid, body.subject, body.role) };
    }

    @Post('revoke')
    async revoke(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', RidParam) rid: Library.Resource.Rid,
        @Body(new ZodPipe(API.Grant.Revoke.Request)) body: API.Grant.Revoke.Request,
    ): Promise<void> {
        await this.gatekeeper.revoke(principal, rid, body.subject);
    }
}
