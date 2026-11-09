import type { Durable } from '@quarry/shared/domain';
import type { DurableQueues } from '../queue/durable-queues';
import type { OutboxRepository } from '../outbox/outbox.repository';

/**
 * One durable event, as its publisher uses it — what `@InjectDurableEvent(definition)` injects.
 * `publish` joins the caller's @Transactional transaction (and throws outside one); `relay` runs after the commit.
 */
export class DurableEventHandle<E extends Durable.Event.Definition> {

    constructor(
        public readonly definition:     E,
        private readonly outbox:        OutboxRepository,
        private readonly durableQueues: DurableQueues,
    ) {}

    /** Inside the transaction that makes it true: a message for each listener. Again with the same event id: nothing. */
    public async publish(events: { payload: Durable.Event.InputOf<E>; eventId: string }[]): Promise<void> {
        await this.outbox.publish(this.definition.topic, events.map(({ payload, eventId }) => ({
            payload: this.definition.payload.parse(payload),
            jobId:   eventId,
        })));
    }

    /** After the commit: send every listener's unsent messages now. Best effort — never throws; the listeners' sweeps catch the rest. */
    public async relay(): Promise<number> {
        return this.durableQueues.relayEvent(this.definition).catch(() => 0);
    }
}
