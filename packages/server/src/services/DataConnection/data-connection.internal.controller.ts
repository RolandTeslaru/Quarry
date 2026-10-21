import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { DataConnection } from '@quarry/shared/domain';
import { Internal } from '@/auth/current-principal';
import { ZodPipe } from '@/http/zod.pipe';
import { DataConnectionService } from './data-connection.service';

import API = DataConnection.API;

const SyncRunRidParam = new ZodPipe(DataConnection.SyncRun.Rid);

/**
 * Worker-only (`/api/internal/…`, service token): everything a sync run needs
 * from Postgres. Mirrors DataConnection.API.Internal in @quarry/shared.
 */
@Internal()
@Controller('internal')
export class DataConnectionInternalController {

    constructor(private readonly dataConnection: DataConnectionService) {}

    @Post('sync-runs')
    startRun(@Body(new ZodPipe(API.Internal.StartRun.Request)) body: API.Internal.StartRun.Request): Promise<API.Internal.StartRun.Response> {
        return this.dataConnection.run.start(body);
    }

    @Post('sync-runs/reap')
    @HttpCode(200)
    async reap(@Body(new ZodPipe(API.Internal.ReapRuns.Request)) body: API.Internal.ReapRuns.Request): Promise<API.Internal.ReapRuns.Response> {
        return { reaped: await this.dataConnection.run.reap(body.staleMinutes) };
    }

    @Post('sync-runs/:runRid/heartbeat')
    @HttpCode(204)
    heartbeat(@Param('runRid', SyncRunRidParam) runRid: DataConnection.SyncRun.Rid): Promise<void> {
        return this.dataConnection.run.heartbeat(runRid);
    }

    @Post('sync-runs/:runRid/complete')
    @HttpCode(200)
    complete(
        @Param('runRid', SyncRunRidParam) runRid: DataConnection.SyncRun.Rid,
        @Body(new ZodPipe(API.Internal.CompleteRun.Request)) body: API.Internal.CompleteRun.Request,
    ): Promise<API.Internal.CompleteRun.Response> {
        return this.dataConnection.run.complete(runRid, body);
    }

    @Post('sync-runs/:runRid/fail')
    @HttpCode(204)
    fail(
        @Param('runRid', SyncRunRidParam) runRid: DataConnection.SyncRun.Rid,
        @Body(new ZodPipe(API.Internal.FailRun.Request)) body: API.Internal.FailRun.Request,
    ): Promise<void> {
        return this.dataConnection.run.fail(runRid, body.message);
    }

    @Get('syncs/scheduled')
    async scheduled(): Promise<API.Internal.ScheduledSyncs.Response> {
        return { syncs: await this.dataConnection.sync.scheduled() };
    }
}
