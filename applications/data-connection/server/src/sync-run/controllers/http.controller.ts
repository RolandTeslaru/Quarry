import { Controller, Get, Param } from '@nestjs/common';
import { DataConnection } from '@quarry/shared/domain';
import { CurrentPrincipal } from '@quarry/platform-kernel/auth/current-principal';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { ZodPipe } from '@quarry/platform-kernel/http/zod.pipe';
import { SyncRunService } from '../sync-run.service';

import API = DataConnection.API;
const SourceRidParam = new ZodPipe(DataConnection.Source.Rid);
const SyncRidParam = new ZodPipe(DataConnection.Sync.Rid);

/** A sync's run history (DataConnection.API.Sync.ListRuns in @quarry/shared). */
@Controller('data-connection/sources')
export class SyncRunController {

    constructor(private readonly syncRuns: SyncRunService) {}

    @Get(':rid/syncs/:syncRid/runs')
    async listRuns(
        @CurrentPrincipal() principal: Principal.User,
        @Param('rid', SourceRidParam) rid: DataConnection.Source.Rid,
        @Param('syncRid', SyncRidParam) syncRid: DataConnection.Sync.Rid,
    ): Promise<API.Sync.ListRuns.Response> {
        return { runs: await this.syncRuns.list(principal, rid, syncRid) };
    }
}
