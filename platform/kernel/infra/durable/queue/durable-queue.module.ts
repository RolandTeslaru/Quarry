import { Inject, Module, type DynamicModule } from '@nestjs/common';
import type { Durable } from '@quarry/shared/domain';
import { DurableEventHandle } from '../event/durable-event.handle';
import { DurableQueueHandle } from './durable-queue.handle';
import { DurableQueues } from './durable-queues';
import { EventListenerRepository } from '../event-listener/event-listener.repository';
import { OutboxRepository } from '../outbox/outbox.repository';

export const getDurableQueueToken = (name: string): string => `quarry:durable-queue:${name}`;

export const getDurableEventToken = (topic: string): string => `quarry:durable-event:${topic}`;

/** Injects a registered durable queue's handle — as `@InjectQueue(name)` does a BullMQ queue. */
export const InjectDurableQueue = (definition: Durable.Queue.Definition): ParameterDecorator =>
    Inject(getDurableQueueToken(definition.name));

/** Injects a registered durable event's handle, for its publisher. */
export const InjectDurableEvent = (definition: Durable.Event.Definition): ParameterDecorator =>
    Inject(getDurableEventToken(definition.topic));

/**
 * Durable queues (docs/design/durable-queues.md), as `@nestjs/bullmq`'s BullModule:
 * `forRoot()` once (the outbox, the relay), `registerQueue(definition)` in each module
 * that uses one, then `@InjectDurableQueue(definition)`. A durable event's publisher registers it
 * with `registerEvent(definition)` and injects `@InjectDurableEvent(definition)`; a listener registers
 * its `Durable.EventListener` with `registerQueue`, as any durable queue it consumes.
 */
@Module({})
export class DurableQueueModule {

    public static forRoot(): DynamicModule {
        return {
            module:    DurableQueueModule,
            global:    true,
            providers: [OutboxRepository, EventListenerRepository, DurableQueues],
            exports:   [OutboxRepository, EventListenerRepository, DurableQueues],
        };
    }

    public static registerQueue(...definitions: Durable.Queue.Definition[]): DynamicModule {
        const providers = definitions.map((definition) => ({
            provide:    getDurableQueueToken(definition.name),
            inject:     [OutboxRepository, DurableQueues],
            useFactory: (outbox: OutboxRepository, durableQueues: DurableQueues) => {
                durableQueues.register(definition);

                return new DurableQueueHandle(definition, outbox, durableQueues);
            },
        }));

        return { module: DurableQueueModule, providers, exports: providers.map((provider) => provider.provide) };
    }

    public static registerEvent(...definitions: Durable.Event.Definition[]): DynamicModule {
        const providers = definitions.map((definition) => ({
            provide:    getDurableEventToken(definition.topic),
            inject:     [OutboxRepository, DurableQueues],
            useFactory: (outbox: OutboxRepository, durableQueues: DurableQueues) => new DurableEventHandle(definition, outbox, durableQueues),
        }));

        return { module: DurableQueueModule, providers, exports: providers.map((provider) => provider.provide) };
    }
}
