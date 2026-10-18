import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { Catalog } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { QueueManager, JobProcessor } from '@/infra/queue';
import { OutboxRepository } from './outbox.repository';

const OUTBOX_RELAY_EVERY_MS = 5_000;
const BATCH = 100;

/**
 * system-worker: publishes catalog.outbox rows to BullMQ. A crash between
 * enqueue and mark re-publishes next tick; the transaction RID as jobId makes
 * that a no-op.
 */
@Processor(Catalog.Queue.OutboxRelay.Definition.name, { concurrency: 1 })
export class OutboxRelayProcessor extends JobProcessor<typeof Catalog.Queue.OutboxRelay.Definition> implements OnApplicationBootstrap {

    protected readonly definition = Catalog.Queue.OutboxRelay.Definition;

    private readonly logger = new Logger(OutboxRelayProcessor.name);

    constructor(
        private readonly repository:   OutboxRepository,
        private readonly queueManager: QueueManager,
    ) {
        super();
    }

    async onApplicationBootstrap(): Promise<void> {
        await this.queueManager.upsertScheduler(this.definition, 'singleton', { every: OUTBOX_RELAY_EVERY_MS }, {});
    }

    protected async handle(): Promise<{ published: number }> {
        const self = Principal.SELF('catalog.outboxRelay');
        const rows = await this.repository.pending(self, BATCH);

        for (const row of rows) {
            if (row.event !== 'dataset.updated') {
                this.logger.warn(`Unknown outbox event '${row.event}' (id ${row.id}) — skipped`);
                continue;
            }

            const job = Catalog.Queue.DatasetUpdated.Job.parse(row.payload);

            await this.queueManager.add(Catalog.Queue.DatasetUpdated.Definition, job, { jobId: job.transactionRid });
        }

        await this.repository.markPublished(self, rows.map((row) => row.id));

        return { published: rows.length };
    }
}
