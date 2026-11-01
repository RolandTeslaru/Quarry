import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type { z } from 'zod';
import { DataConnection } from '@quarry/shared/domain';
import { CurrentPrincipal } from '@quarry/platform-kernel/auth/current-principal';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { ZodPipe } from '@quarry/platform-kernel/http/zod.pipe';
import { SourceService } from '../source.service';

import API = DataConnection.API;
const SourceRidParam = new ZodPipe(DataConnection.Source.Rid);

/** Mirrors DataConnection.API.Source in @quarry/shared. */
@Controller('data-connection/sources')
export class SourceController {

    constructor(private readonly sources: SourceService) {}

    @Post()
    async create(
        @CurrentPrincipal() principal: Principal.User,
        @Body(new ZodPipe(API.Source.Create.Request)) body: API.Source.Create.Request,
    ): Promise<API.Source.Create.Response> {
        return { source: await this.sources.create(principal, body) };
    }

    @Get()
    async list(@CurrentPrincipal() principal: Principal.User): Promise<API.Source.List.Response> {
        return { sources: await this.sources.list(principal) };
    }

    /** The source types this deployment supports, with their config forms. Declared before :rid so "definitions" isn't read as a RID. */
    @Get('definitions')
    definitions(): API.Source.ListDefinitions.Response {
        return { definitions: this.sources.definitions() };
    }

    /** An app opened the source's page: the source, the open recorded (audit). */
    @Post(':rid/open')
    @HttpCode(200)
    async open(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', SourceRidParam) rid: DataConnection.Source.Rid,
        @Body(new ZodPipe(API.Source.Open.Request)) body: API.Source.Open.Request,
    ): Promise<API.Source.Open.Response> {
        return { source: await this.sources.open(principal, rid, body.application) };
    }

    @Get(':rid')
    async get(@CurrentPrincipal() principal: Principal.User, @Param('rid', SourceRidParam) rid: DataConnection.Source.Rid): Promise<API.Source.Get.Response> {
        return { source: await this.sources.get(principal, rid) };
    }

    @Post(':rid/test')
    @HttpCode(200)
    test(@CurrentPrincipal() principal: Principal.User, @Param('rid', SourceRidParam) rid: DataConnection.Source.Rid): Promise<API.Source.Test.Response> {
        return this.sources.test(principal, rid);
    }

    @Get(':rid/tables/:schema/:table/preview')
    previewTable(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', SourceRidParam) rid: DataConnection.Source.Rid,
        @Param('schema') schema: string,
        @Param('table') table: string,
        @Query(new ZodPipe(API.Source.PreviewTable.Query)) query: z.output<typeof API.Source.PreviewTable.Query>,
    ): Promise<API.Source.PreviewTable.Response> {
        return this.sources.previewTable(principal, rid, { schema, name: table }, query.limit);
    }

    @Get(':rid/explore')
    explore(@CurrentPrincipal() principal: Principal.User, @Param('rid', SourceRidParam) rid: DataConnection.Source.Rid): Promise<API.Source.Explore.Response> {
        return this.sources.explore(principal, rid);
    }
}
