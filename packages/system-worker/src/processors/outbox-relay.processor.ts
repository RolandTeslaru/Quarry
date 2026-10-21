import { InjectQueue, Processor } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { Catalog } from '@quarry/shared/domain';
import { JobProcessor, server } from '../infra';

const OUTBOX_BATCH = 100;

/**
 * Outbox relay: unpublished catalog.outbox rows (read through the server's
 * /internal API) → BullMQ, then mark them published. A crash in between
 * re-publishes next tick; the transaction RID as jobId makes that a no-op.
 */
@Processor(Catalog.Queue.OutboxRelay.Definition.name, { concurrency: 1 })
export class OutboxRelayProcessor extends JobProcessor<typeof Catalog.Queue.OutboxRelay.Definition> {

    protected readonly definition = Catalog.Queue.OutboxRelay.Definition;

    private readonly logger = new Logger(OutboxRelayProcessor.name);

    constructor(@InjectQueue(Catalog.Queue.DatasetUpdated.Definition.name) private readonly datasetUpdated: Queue) {
        super();
    }

    protected async handle(): Promise<Catalog.Queue.OutboxRelay.Result> {
        const { events } = await Catalog.API.Internal.pendingEvents(server(), OUTBOX_BATCH);

        const queueDefinition = Catalog.Queue.DatasetUpdated.Definition;

        for (const event of events) {
            if (event.event !== 'dataset.updated') {
                this.logger.warn(`Unknown outbox event '${event.event}' (id ${event.id}) — skipped`);
                continue;
            }

            const job = Catalog.Queue.DatasetUpdated.Job.parse(event.payload);

            await this.datasetUpdated.add(queueDefinition.name, job, { ...queueDefinition.options, jobId: job.transactionRid });
        }

        await Catalog.API.Internal.markPublished(server(), { ids: events.map((event) => event.id) });

        return { published: events.length };
    }
}
