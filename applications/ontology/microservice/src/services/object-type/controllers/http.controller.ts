import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { Ontology } from '@quarry/shared/domain';
import { CurrentPrincipal } from '@quarry/platform-kernel/auth/current-principal';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { ZodPipe } from '@quarry/platform-kernel/http/zod.pipe';
import { ObjectTypeService } from '../object-type.service';

import API = Ontology.API.ObjectType;
const ObjectTypeRidParam = new ZodPipe(Ontology.ObjectType.Rid);

/** Mirrors Ontology.API.ObjectType in @quarry/shared. Its link types are LinkTypeController's. */
@Controller('ontology/object-types')
export class ObjectTypeController {

    constructor(private readonly objectTypes: ObjectTypeService) {}

    @Post()
    async create(
        @CurrentPrincipal() principal: Principal.User,
        @Body(new ZodPipe(API.Create.Request)) body: API.Create.Request,
    ): Promise<API.Create.Response> {
        return this.objectTypes.create(principal, body);
    }

    @Get()
    async list(@CurrentPrincipal() principal: Principal.User): Promise<API.List.Response> {
        return { objectTypes: await this.objectTypes.repository.list(principal) };
    }

    @Get(':rid')
    async get(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', ObjectTypeRidParam) rid: Ontology.ObjectType.Rid,
    ): Promise<API.Get.Response> {
        return this.objectTypes.get(principal, rid);
    }

    @Put(':rid')
    async replace(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', ObjectTypeRidParam) rid: Ontology.ObjectType.Rid,
        @Body(new ZodPipe(API.Replace.Request)) body: API.Replace.Request,
    ): Promise<API.Replace.Response> {
        return this.objectTypes.replace(principal, rid, body);
    }
}
