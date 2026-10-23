import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Catalog } from '@quarry/shared/domain';
import { CurrentPrincipal } from '@/auth/current-principal';
import { Principal } from '@/auth/principal';
import { readUpload } from '@/http/multipart';
import { ZodPipe } from '@/http/zod.pipe';
import { CatalogService } from './catalog.service';

import API = Catalog.API;
const DatasetRidParam = new ZodPipe(Catalog.Dataset.Rid);

/** Mirrors Catalog.API in @quarry/shared. */
@Controller('datasets')
export class CatalogController {

    constructor(private readonly catalog: CatalogService) {}

    @Get()
    async list(@CurrentPrincipal() principal: Principal.User): Promise<API.Dataset.List.Response> {
        return { datasets: await this.catalog.list(principal) };
    }

    @Post()
    async create(
        @CurrentPrincipal() principal: Principal.User,
        @Body(new ZodPipe(API.Dataset.Create.Request)) body: API.Dataset.Create.Request,
    ): Promise<API.Dataset.Create.Response> {
        return { dataset: await this.catalog.createDataset(principal, body) };
    }

    /** A new dataset from a CSV or Parquet file (multipart). Declared before :rid so "upload" isn't read as a RID. */
    @Post('upload')
    async createFromFile(@CurrentPrincipal() principal: Principal.User, @Req() request: Request): Promise<API.Dataset.Upload.Response> {
        const { fields, file } = await readUpload(request, API.Dataset.Upload.NewFields);

        return this.catalog.storage.createFromFile(principal, fields, file);
    }

    @Post(':rid/upload')
    async upload(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', DatasetRidParam) rid: Catalog.Dataset.Rid,
        @Req() request: Request,
    ): Promise<API.Dataset.Upload.Response> {
        const { fields, file } = await readUpload(request, API.Dataset.Upload.Fields);

        return this.catalog.storage.upload(principal, rid, fields.mode, file);
    }

    @Get(':rid/preview')
    preview(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', DatasetRidParam) rid: Catalog.Dataset.Rid,
        @Query(new ZodPipe(API.Dataset.Preview.Query)) query: API.Dataset.Preview.Query,
    ): Promise<API.Dataset.Preview.Response> {
        return this.catalog.storage.preview(principal, rid, query.limit);
    }

    @Put(':rid/schema')
    async setSchema(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', DatasetRidParam) rid: Catalog.Dataset.Rid,
        @Body(new ZodPipe(API.Dataset.SetSchema.Request)) body: API.Dataset.SetSchema.Request,
    ): Promise<API.Dataset.SetSchema.Response> {
        return { sequence: await this.catalog.storage.setSchema(principal, rid, body.schema) };
    }

    @Get(':rid')
    async get(@CurrentPrincipal() principal: Principal.User, @Param('rid', DatasetRidParam) rid: Catalog.Dataset.Rid): Promise<API.Dataset.Get.Response> {
        return { dataset: await this.catalog.get(principal, rid) };
    }

    /** An app opened the dataset's page: the dataset and its latest view, the open recorded (audit). */
    @Post(':rid/open')
    @HttpCode(200)
    async open(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', DatasetRidParam) rid: Catalog.Dataset.Rid,
        @Body(new ZodPipe(API.Dataset.Open.Request)) body: API.Dataset.Open.Request,
    ): Promise<API.Dataset.Open.Response> {
        return this.catalog.open(principal, rid, body.application);
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
