import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { Catalog, CodeWorkspace, DataConnection, Foundations } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { api } from '@quarry/shared/server/internal-api';

/**
 * On boot: registers each housekeeping job's repeating schedule (BullMQ keeps
 * it singleton across replicas), and makes the sync job schedulers mirror
 * data_connection.sync.schedule — the server keeps them in step on every
 * change; this heals a wiped or drifted Redis.
 */
@Injectable()
export class Schedules implements OnApplicationBootstrap {

    private readonly log = System.log.withContext('Schedules');

    constructor(
        @InjectQueue(Catalog.Queue.OutboxRelay.Definition.name)       private readonly outboxRelay: Queue,
        @InjectQueue(Catalog.Queue.StorageGc.Definition.name)         private readonly storageGc:   Queue,
        @InjectQueue(DataConnection.Queue.SyncReaper.Definition.name) private readonly syncReaper:  Queue,
        @InjectQueue(DataConnection.Queue.Sync.Definition.name)       private readonly sync:        Queue,
        @InjectQueue(CodeWorkspace.CI.Queue.CheckSweep.Definition.name)  private readonly checkSweep:  Queue,
        @InjectQueue(Foundations.DurableQueue.Sweep.Definition.name)  private readonly durableQueueSweep: Queue,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        const every: [Queue, { name: string; options?: object }, number][] = [
            [this.outboxRelay, Catalog.Queue.OutboxRelay.Definition,       5_000],           // every 5 s
            [this.storageGc,   Catalog.Queue.StorageGc.Definition,         60 * 60_000],     // hourly
            [this.syncReaper,  DataConnection.Queue.SyncReaper.Definition, 2 * 60_000],      // every 2 min
            [this.checkSweep,  CodeWorkspace.CI.Queue.CheckSweep.Definition,  60_000],          // every minute
            [this.durableQueueSweep, Foundations.DurableQueue.Sweep.Definition, 60_000],     // every minute — every durable queue
        ];

        for (const [queue, queueDefinition, ms] of every)
            await queue.upsertJobScheduler('singleton', { every: ms }, { name: queueDefinition.name, data: {}, opts: queueDefinition.options });

        await this.reconcileSyncSchedules();
    }

    private async reconcileSyncSchedules(): Promise<void> {
        const queueDefinition = DataConnection.Queue.Sync.Definition;
        const { syncs } = await DataConnection.API.Internal.scheduledSyncs(api);
        const wanted = new Set<string>(syncs.map((sync) => sync.rid));

        for (const sync of syncs) {
            const job: DataConnection.Queue.Sync.Job = {
                syncRid:     sync.rid,
                trigger:     'schedule',
                triggeredBy: null,
            };

            await this.sync.upsertJobScheduler(sync.rid, { pattern: sync.schedule }, {
                name: queueDefinition.name,
                data: job,
                opts: queueDefinition.options,
            });
        }

        let removed = 0;

        for (const scheduler of await this.sync.getJobSchedulers())
            if (!wanted.has(scheduler.key)) {
                await this.sync.removeJobScheduler(scheduler.key);
                removed++;
            }

        this.log.info(`Reconciled ${syncs.length} sync schedules (${removed} stale removed)`);
    }
}
