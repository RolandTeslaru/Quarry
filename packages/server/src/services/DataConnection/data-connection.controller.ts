import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { DataConnection } from '@quarry/shared/domain';
import { CurrentPrincipal } from '@/auth/current-principal';
import { Principal } from '@/auth/principal';
import { ZodPipe } from '@/http/zod.pipe';
import { DataConnectionService } from './data-connection.service';

import API = DataConnection.API;
const SourceRidParam = new ZodPipe(DataConnection.Source.Rid);
const SyncRidParam = new ZodPipe(DataConnection.Sync.Rid);

/** Mirrors DataConnection.API in @quarry/shared. */
@Controller('sources')
export class DataConnectionController {

    constructor(private readonly dataConnection: DataConnectionService) {}

    @Post()
    async create(
        @CurrentPrincipal() principal: Principal.User,
        @Body(new ZodPipe(API.Source.Create.Request)) body: API.Source.Create.Request,
    ): Promise<API.Source.Create.Response> {
        return { source: await this.dataConnection.source.create(principal, body) };
    }

    @Get()
    async list(@CurrentPrincipal() principal: Principal.User): Promise<API.Source.List.Response> {
        return { sources: await this.dataConnection.source.list(principal) };
    }

    /** The source types this deployment supports, with their config forms. Declared before :rid so "definitions" isn't read as a RID. */
    @Get('definitions')
    definitions(): API.Source.ListDefinitions.Response {
        return { definitions: this.dataConnection.source.definitions() };
    }

    @Get(':rid')
    async get(@CurrentPrincipal() principal: Principal.User, @Param('rid', SourceRidParam) rid: DataConnection.Source.Rid): Promise<API.Source.Get.Response> {
        return { source: await this.dataConnection.source.get(principal, rid) };
    }

    @Post(':rid/test')
    @HttpCode(200)
    test(@CurrentPrincipal() principal: Principal.User, @Param('rid', SourceRidParam) rid: DataConnection.Source.Rid): Promise<API.Source.Test.Response> {
        return this.dataConnection.source.test(principal, rid);
    }

    @Get(':rid/explore')
    explore(@CurrentPrincipal() principal: Principal.User, @Param('rid', SourceRidParam) rid: DataConnection.Source.Rid): Promise<API.Source.Explore.Response> {
        return this.dataConnection.source.explore(principal, rid);
    }

    @Get(':rid/syncs')
    async listSyncs(@CurrentPrincipal() principal: Principal.User, @Param('rid', SourceRidParam) rid: DataConnection.Source.Rid): Promise<API.Sync.List.Response> {
        return { syncs: await this.dataConnection.sync.list(principal, rid) };
    }

    @Post(':rid/syncs')
    async createSync(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', SourceRidParam) rid: DataConnection.Source.Rid,
        @Body(new ZodPipe(API.Sync.Create.Request)) body: API.Sync.Create.Request,
    ): Promise<API.Sync.Create.Response> {
        return { sync: await this.dataConnection.sync.create(principal, rid, body) };
    }

    @Post(':rid/syncs/:syncRid/run')
    @HttpCode(202)
    async run(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', SourceRidParam) rid: DataConnection.Source.Rid,
        @Param('syncRid', SyncRidParam) syncRid: DataConnection.Sync.Rid,
    ): Promise<void> {
        await this.dataConnection.sync.run(principal, rid, syncRid);
    }

    @Get(':rid/syncs/:syncRid/runs')
    async listRuns(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', SourceRidParam) rid: DataConnection.Source.Rid,
        @Param('syncRid', SyncRidParam) syncRid: DataConnection.Sync.Rid,
    ): Promise<API.Sync.ListRuns.Response> {
        return { runs: await this.dataConnection.run.list(principal, rid, syncRid) };
    }
}
