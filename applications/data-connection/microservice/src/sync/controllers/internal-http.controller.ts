import { Controller, Get } from '@nestjs/common';
import { DataConnection } from '@quarry/shared/domain';
import { Internal } from '@quarry/platform-kernel/auth/current-principal';
import { SyncService } from '../sync.service';

import API = DataConnection.API;

/** For the system worker (`/api/internal/…`, service token): the syncs it mirrors into BullMQ's schedulers. */
@Internal()
@Controller('internal')
export class SyncInternalController {

    constructor(private readonly syncs: SyncService) {}

    @Get('syncs/scheduled')
    async scheduled(): Promise<API.Internal.ScheduledSyncs.Response> {
        return { syncs: await this.syncs.scheduled() };
    }
}
