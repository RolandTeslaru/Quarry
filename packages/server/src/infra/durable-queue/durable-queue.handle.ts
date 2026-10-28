import type { Foundations } from '@quarry/shared/domain';
import type { DurableQueues } from './durable-queues';
import type { OutboxRepository } from './outbox.repository';

/**
 * One durable queue, as a domain uses it — what `@InjectDurableQueue(definition)` injects.
 * `add` and `ack` join the caller's @Transactional transaction (and throw outside one);
 * `relay` runs after the commit.
 */
export class DurableQueueHandle<Q extends Foundations.Queue.Definition> {

    constructor(
        public readonly definition: Foundations.DurableQueue.Definition<Q>,
        private readonly outbox:    OutboxRepository,
        private readonly durableQueues: DurableQueues,
    ) {}

    /** Inside the transaction that calls for the work. Again with the same job id: nothing. */
    public async add(messages: { message: Foundations.Queue.InputOf<Q>; jobId: string }[]): Promise<void> {
        await this.outbox.add(this.definition.name, messages.map(({ message, jobId }) => ({
            payload: this.definition.queue.job.parse(message),
            jobId,
        })));
    }

    /** Inside the transaction that takes (or cancels) the work: stop sending it. */
    public async ack(jobIds: string[]): Promise<void> {
        await this.outbox.ack(this.definition.name, jobIds);
    }

    /** After the commit: send this queue's unsent messages now. Best effort — never throws; the sweep catches the rest. */
    public async relay(): Promise<number> {
        return this.durableQueues.relay(this.definition).catch(() => 0);
    }
}
