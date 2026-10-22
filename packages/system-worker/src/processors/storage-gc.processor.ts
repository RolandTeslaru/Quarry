import { Processor } from '@nestjs/bullmq';
import { Catalog } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { JobProcessor, server } from '../infra';

const STALE_OPEN_HOURS = 24;
const SWEEP_ABORTED_DAYS = 7;

/** Storage GC: the server aborts stale transactions and deletes the files of aborted ones. */
@Processor(Catalog.Queue.StorageGc.Definition.name, { concurrency: 1 })
export class StorageGcProcessor extends JobProcessor<typeof Catalog.Queue.StorageGc.Definition> {

    protected readonly definition = Catalog.Queue.StorageGc.Definition;

    private readonly log = System.log.withContext('StorageGc');

    protected async handle(): Promise<Catalog.Queue.StorageGc.Result> {
        const result = await Catalog.API.Internal.storageGc(server(), { staleOpenHours: STALE_OPEN_HOURS, sweepAbortedDays: SWEEP_ABORTED_DAYS });

        if (result.aborted > 0 || result.filesDeleted > 0)
            this.log.info(`Aborted ${result.aborted} stale transactions, deleted ${result.filesDeleted} files`);

        return result;
    }
}
