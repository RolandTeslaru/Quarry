import { Inject, Module, type DynamicModule } from '@nestjs/common';
import type { Foundations } from '@quarry/shared/domain';
import { DurableQueueHandle } from './durable-queue.handle';
import { DurableQueues } from './durable-queues';
import { OutboxRepository } from './outbox.repository';

export const getDurableQueueToken = (name: string): string => `quarry:durable-queue:${name}`;

/** Injects a registered durable queue's handle — as `@InjectQueue(name)` does a BullMQ queue. */
export const InjectDurableQueue = (definition: Foundations.DurableQueue.Definition): ParameterDecorator =>
    Inject(getDurableQueueToken(definition.name));

/**
 * Durable queues (docs/design/durable-queues.md), as `@nestjs/bullmq`'s BullModule:
 * `forRoot()` once (the outbox, the relay), `registerQueue(definition)` in each module
 * that uses one, then `@InjectDurableQueue(definition)`.
 */
@Module({})
export class DurableQueueModule {

    public static forRoot(): DynamicModule {
        return {
            module:    DurableQueueModule,
            global:    true,
            providers: [OutboxRepository, DurableQueues],
            exports:   [OutboxRepository, DurableQueues],
        };
    }

    public static registerQueue(...definitions: Foundations.DurableQueue.Definition[]): DynamicModule {
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
}
