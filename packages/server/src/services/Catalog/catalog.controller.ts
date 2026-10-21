import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Catalog } from '@quarry/shared/domain';
import { CurrentPrincipal } from '@/auth/current-principal';
import { Principal } from '@/auth/principal';
import { ZodPipe } from '@/http/zod.pipe';
import { CatalogService } from './catalog.service';

import API = Catalog.API;
const DatasetRidParam = new ZodPipe(Catalog.Dataset.Rid);

/** Mirrors Catalog.API in @quarry/shared. */
@Controller('datasets')
export class CatalogController {

    constructor(private readonly catalog: CatalogService) {}

    @Post()
    async create(
        @CurrentPrincipal() principal: Principal.User,
        @Body(new ZodPipe(API.Dataset.Create.Request)) body: API.Dataset.Create.Request,
    ): Promise<API.Dataset.Create.Response> {
        return { dataset: await this.catalog.createDataset(principal, body) };
    }

    @Get(':rid')
    async get(@CurrentPrincipal() principal: Principal.User, @Param('rid', DatasetRidParam) rid: Catalog.Dataset.Rid): Promise<API.Dataset.Get.Response> {
        return { dataset: await this.catalog.get(principal, rid) };
    }

    @Get(':rid/view')
    async view(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', DatasetRidParam) rid: Catalog.Dataset.Rid,
        @Query(new ZodPipe(API.Dataset.GetView.Query)) query: API.Dataset.GetView.Query,
    ): Promise<API.Dataset.GetView.Response> {
        return { view: await this.catalog.view(principal, rid, query.sequence) };
    }
}
