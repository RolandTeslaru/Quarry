import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { Ontology } from '@quarry/shared/domain';
import { CurrentPrincipal } from '@quarry/platform-kernel/auth/current-principal';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { ZodPipe } from '@quarry/platform-kernel/http/zod.pipe';
import { LinkTypeService } from '../link-type.service';

import API = Ontology.API;
const LinkTypeRidParam = new ZodPipe(Ontology.LinkType.Rid);
const ObjectTypeRidParam = new ZodPipe(Ontology.ObjectType.Rid);

/** Mirrors Ontology.API.LinkType in @quarry/shared, and an object type's link types (Ontology.API.ObjectType.ListLinkTypes). */
@Controller('ontology')
export class LinkTypeController {

    constructor(private readonly linkTypes: LinkTypeService) {}

    @Post('link-types')
    async create(
        @CurrentPrincipal() principal: Principal.User,
        @Body(new ZodPipe(API.LinkType.Create.Request)) body: API.LinkType.Create.Request,
    ): Promise<API.LinkType.Create.Response> {
        return this.linkTypes.create(principal, body);
    }

    @Get('link-types')
    async list(@CurrentPrincipal() principal: Principal.User): Promise<API.LinkType.List.Response> {
        return { linkTypes: await this.linkTypes.repository.list(principal) };
    }

    @Get('link-types/:rid')
    async get(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', LinkTypeRidParam) rid: Ontology.LinkType.Rid,
    ): Promise<API.LinkType.Get.Response> {
        return this.linkTypes.get(principal, rid);
    }

    @Put('link-types/:rid')
    async replace(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', LinkTypeRidParam) rid: Ontology.LinkType.Rid,
        @Body(new ZodPipe(API.LinkType.Replace.Request)) body: API.LinkType.Replace.Request,
    ): Promise<API.LinkType.Replace.Response> {
        return this.linkTypes.replace(principal, rid, body);
    }

    @Get('object-types/:rid/link-types')
    async listForObjectType(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', ObjectTypeRidParam) rid: Ontology.ObjectType.Rid,
    ): Promise<API.ObjectType.ListLinkTypes.Response> {
        return { linkTypes: await this.linkTypes.listForObjectType(principal, rid) };
    }
}
