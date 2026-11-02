import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { Catalog, CodeWorkspace, Foundations } from '@quarry/shared/domain';

/**
 * On boot: registers each housekeeping job's repeating schedule (BullMQ keeps
 * it singleton across replicas).
 */
@Injectable()
export class Schedules implements OnApplicationBootstrap {

    constructor(
        @InjectQueue(Catalog.Queue.StorageGc.Definition.name)         private readonly storageGc:   Queue,
        @InjectQueue(CodeWorkspace.CI.Queue.CheckSweep.Definition.name)  private readonly checkSweep:  Queue,
        @InjectQueue(Foundations.DurableQueue.Sweep.Definition.name)  private readonly durableQueueSweep: Queue,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        const every: [Queue, { name: string; options?: object }, number][] = [
            [this.storageGc,   Catalog.Queue.StorageGc.Definition,         60 * 60_000],     // hourly
            [this.checkSweep,  CodeWorkspace.CI.Queue.CheckSweep.Definition,  60_000],          // every minute
            [this.durableQueueSweep, Foundations.DurableQueue.Sweep.Definition, 60_000],     // every minute — every durable queue
        ];

        for (const [queue, queueDefinition, ms] of every)
            await queue.upsertJobScheduler('singleton', { every: ms }, { name: queueDefinition.name, data: {}, opts: queueDefinition.options });
    }
}
