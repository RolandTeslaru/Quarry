import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { DataConnection } from '@quarry/shared/domain';
import { CurrentPrincipal } from '@quarry/platform-kernel/auth/current-principal';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { ZodPipe } from '@quarry/platform-kernel/http/zod.pipe';
import { SyncService } from '../sync.service';

import API = DataConnection.API;
const SourceRidParam = new ZodPipe(DataConnection.Source.Rid);

/** Mirrors DataConnection.API.Sync in @quarry/shared — a source's syncs. */
@Controller('data-connection/sources')
export class SyncController {

    constructor(private readonly syncs: SyncService) {}

    @Get(':rid/syncs')
    async listSyncs(@CurrentPrincipal() principal: Principal.User, @Param('rid', SourceRidParam) rid: DataConnection.Source.Rid): Promise<API.Sync.List.Response> {
        return { syncs: await this.syncs.list(principal, rid) };
    }

    @Post(':rid/syncs')
    async createSync(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', SourceRidParam) rid: DataConnection.Source.Rid,
        @Body(new ZodPipe(API.Sync.Create.Request)) body: API.Sync.Create.Request,
    ): Promise<API.Sync.Create.Response> {
        return { sync: await this.syncs.create(principal, rid, body) };
    }
}
