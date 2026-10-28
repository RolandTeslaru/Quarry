import { Injectable } from '@nestjs/common';
import { Foundations } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { Principal } from '@/auth/principal';
import { QueueManager } from '../queue';
import { OutboxRepository } from './outbox.repository';
import type { OutboxDB } from './outbox.db';

type Definition = Foundations.DurableQueue.Definition;

const RELAY = Principal.SELF('durable-queue.relay');

/**
 * The durable queues' runtime (docs/design/durable-queues.md): which are registered,
 * and relaying their outbox messages to Redis — send, then mark. A send that fails
 * stays unsent; the sweep sends it next minute.
 */
@Injectable()
export class DurableQueues {

    private readonly log = System.log.withContext('DurableQueues');

    private readonly definitions = new Map<Foundations.Queue.Name, Definition>();

    constructor(
        private readonly outbox: OutboxRepository,
        private readonly queues: QueueManager,
    ) {}

    public register(definition: Definition): void {
        const registered = this.definitions.get(definition.name);

        if (registered && registered !== definition)
            throw new Error(`Durable queue ${definition.name} registered twice, differently`);

        this.definitions.set(definition.name, definition);
    }

    public get(name: Foundations.Queue.Name): Definition | undefined {
        return this.definitions.get(name);
    }

    /** One queue's unsent messages — or, sweeping, its stale ones too. Returns how many were sent. */
    public async relay(definition: Definition, sweeping = false): Promise<number> {
        const messages = await this.outbox.listToSend(RELAY, definition.name, sweeping ? definition.staleSentMinutes : null);
        let sent = 0;

        for (const message of messages) {
            try {
                await this.send(definition, message);
            }
            catch (error) {
                this.log.warning(`Couldn't send ${definition.name} messages — they stay in the outbox`, {
                    jobId: message.job_id,
                    error: error instanceof Error ? error.message : String(error),
                });

                return sent;                                    // Redis is down: so is every other send
            }

            sent++;
        }

        return sent;
    }

    /** Every registered queue, stale messages included; the system worker's minute. */
    public async sweep(): Promise<number> {
        let sent = 0;

        for (const definition of this.definitions.values())
            sent += await this.relay(definition, true);

        for (const unknown of await this.outbox.listUnknownQueues(RELAY, [...this.definitions.keys()]))
            this.log.error(`${unknown.messages} outbox message(s) for ${unknown.queueName}, which no durable queue registers — left in place`);

        return sent;
    }

    private async send(definition: Definition, message: OutboxDB.Message.Row): Promise<void> {
        await this.queues.add(definition.queue, definition.queue.job.parse(message.payload), { jobId: message.job_id });

        const marked = await this.outbox.markSent(RELAY, message.id);

        if (marked && marked.sends >= Foundations.DurableQueue.SUSPICIOUS_SENDS && marked.sends % Foundations.DurableQueue.SUSPICIOUS_SENDS === 0)
            this.log.warning(`${definition.name} ${message.job_id} has been sent ${marked.sends} times — is its ack missing?`);
    }
}
