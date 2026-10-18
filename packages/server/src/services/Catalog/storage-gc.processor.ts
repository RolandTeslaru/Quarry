import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { Catalog } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { FileStorage } from '@/infra/file-storage';
import { QueueManager, JobProcessor } from '@/infra/queue';
import { TransactionRepository } from './transaction/transaction.repository';

const STORAGE_GC_EVERY_MS = 60 * 60_000;
const STALE_OPEN_HOURS = 24;
const SWEEP_ABORTED_DAYS = 7;

/**
 * system-worker, hourly:
 *   1. abort transactions left open longer than 24 h
 *   2. delete the storage prefix of every transaction aborted in the last 7 days
 *      (idempotent — an already-swept prefix lists empty)
 *
 * Not yet: orphaned files with no transaction row, and history retention
 * (a global policy — see docs/design/catalog.md §7).
 */
@Processor(Catalog.Queue.StorageGc.Definition.name, { concurrency: 1 })
export class StorageGcProcessor extends JobProcessor<typeof Catalog.Queue.StorageGc.Definition> implements OnApplicationBootstrap {

    protected readonly definition = Catalog.Queue.StorageGc.Definition;

    private readonly logger = new Logger(StorageGcProcessor.name);

    constructor(
        private readonly repository:   TransactionRepository,
        private readonly files:        FileStorage,
        private readonly queueManager: QueueManager,
    ) {
        super();
    }

    async onApplicationBootstrap(): Promise<void> {
        await this.queueManager.upsertScheduler(this.definition, 'singleton', { every: STORAGE_GC_EVERY_MS }, {});
    }

    protected async handle(): Promise<{ aborted: number; filesDeleted: number }> {
        const self = Principal.SELF('catalog.storageGc');

        const aborted = await this.repository.abortStale(self, STALE_OPEN_HOURS);
        const sweep = await this.repository.recentlyAborted(self, SWEEP_ABORTED_DAYS);

        let filesDeleted = 0;

        for (const transaction of sweep)
            filesDeleted += await this.files.deletePrefix(`${transaction.dataset_rid}/${transaction.rid}/`);

        if (aborted.length > 0 || filesDeleted > 0)
            this.logger.log(`Aborted ${aborted.length} stale transactions, deleted ${filesDeleted} files`);

        return { aborted: aborted.length, filesDeleted };
    }
}
