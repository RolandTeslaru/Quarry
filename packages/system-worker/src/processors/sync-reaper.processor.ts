import { Processor } from '@nestjs/bullmq';
import { DataConnection } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { api } from '@quarry/shared/server/internal-api';
import { JobProcessor } from '@quarry/shared/server/queue';

const STALE_HEARTBEAT_MINUTES = 5;

/** Reaper: runs whose worker died (heartbeat minutes old) — the server fails them and aborts their transactions. */
@Processor(DataConnection.Queue.SyncReaper.Definition.name, { concurrency: 1 })
export class SyncReaperProcessor extends JobProcessor<typeof DataConnection.Queue.SyncReaper.Definition> {

    protected readonly definition = DataConnection.Queue.SyncReaper.Definition;

    private readonly log = System.log.withContext('SyncReaper');

    protected async handle(): Promise<DataConnection.Queue.SyncReaper.Result> {
        const result = await DataConnection.API.Internal.reapRuns(api, { staleMinutes: STALE_HEARTBEAT_MINUTES });

        if (result.reaped > 0)
            this.log.warning(`Reaped ${result.reaped} stuck sync runs`);

        return result;
    }
}
