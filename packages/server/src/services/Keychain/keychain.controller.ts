import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { Keychain } from '@quarry/shared/domain';
import { CurrentPrincipal } from '@/auth/current-principal';
import { Principal } from '@/auth/principal';
import { ZodPipe } from '@/http/zod.pipe';
import { KeychainService } from './keychain.service';

import API = Keychain.API;
const CredentialRidParam = new ZodPipe(Keychain.Credential.Rid);

/** Mirrors Keychain.API in @quarry/shared. Renaming, moving, trashing and sharing go through Library and Gatekeeper, as for any resource. */
@Controller('keychain')
export class KeychainController {

    constructor(private readonly keychain: KeychainService) {}

    @Get('templates')
    templates(): API.Credential.ListTemplates.Response {
        return { templates: this.keychain.templates() };
    }

    @Get('credentials')
    async list(
        @CurrentPrincipal() principal: Principal.User,
        @Query(new ZodPipe(API.Credential.List.Request)) query: API.Credential.List.Request,
    ): Promise<API.Credential.List.Response> {
        return { credentials: await this.keychain.list(principal, query.templateId) };
    }

    @Post('credentials')
    async create(
        @CurrentPrincipal() principal: Principal.User,
        @Body(new ZodPipe(API.Credential.Create.Request)) body: API.Credential.Create.Request,
    ): Promise<API.Credential.Create.Response> {
        return { credential: await this.keychain.create(principal, body) };
    }

    @Get('credentials/:rid')
    async get(@CurrentPrincipal() principal: Principal.User, @Param('rid', CredentialRidParam) rid: Keychain.Credential.Rid): Promise<API.Credential.Get.Response> {
        return { credential: await this.keychain.get(principal, rid) };
    }

    @Put('credentials/:rid/values')
    @HttpCode(204)
    async updateValues(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', CredentialRidParam) rid: Keychain.Credential.Rid,
        @Body(new ZodPipe(API.Credential.UpdateValues.Request)) body: API.Credential.UpdateValues.Request,
    ): Promise<void> {
        await this.keychain.updateValues(principal, rid, body.values);
    }

    @Post('credentials/:rid/reveal')
    @HttpCode(200)
    async reveal(@CurrentPrincipal() principal: Principal.User, @Param('rid', CredentialRidParam) rid: Keychain.Credential.Rid): Promise<API.Credential.Reveal.Response> {
        return { values: await this.keychain.reveal(principal, rid) };
    }
}
