import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataConnection } from '@quarry/shared/domain';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { QueueManager } from '@quarry/platform-kernel/infra/queue';
import { GatekeeperService } from '@quarry/platform-kernel/services/Gatekeeper/gatekeeper.service';
import { CatalogClient } from '@quarry/platform-kernel/microservice/clients';
import { SecurityGate } from '@quarry/platform-kernel/services/Gatekeeper/security-gate';
import { DataConnectionDB } from '../../data-connection.db';
import { SourceService } from '../source/source.service';
import { validateSyncConfig } from './sync-definition';
import { SyncRepository } from './sync.repository';

/** Syncs: a source copied into a dataset, on demand or on a schedule (mirrored into BullMQ). */
@Injectable()
export class SyncService {

    constructor(
        readonly gatekeeper:           GatekeeperService,
        private readonly sources:      SourceService,
        private readonly catalog:      CatalogClient,
        private readonly queueManager: QueueManager,
        private readonly repository:   SyncRepository,
    ) {}

    /**
     * Creates the output dataset (write on its folder: RLS) and the sync, then
     * mirrors the schedule into BullMQ. Gated on the source up front: the
     * dataset and the scheduler would otherwise exist before RLS refuses the sync row.
     */
    @SecurityGate('write')
    async create(principal: Principal, sourceRid: DataConnection.Source.Rid, request: DataConnection.API.Sync.Create.Request): Promise<DataConnection.Sync> {
        const source = await this.sources.require(principal, sourceRid);
        const config = validateSyncConfig(source, request.config);

        const dataset = await this.catalog.createDataset(principal, {
            parentRid:   request.output.parentRid,
            name:        request.output.name,
            description: `Raw copy written by sync "${request.name}"`,
        });

        const row = await this.repository.create(principal, sourceRid, dataset.rid, {
            rid:      DataConnection.Sync.createRid(),
            name:     request.name,
            config,
            schedule: request.schedule,
        });

        if (row.schedule) {
            const queueDefinition = DataConnection.Queue.Sync.Definition;

            await this.queueManager.upsertScheduler(queueDefinition, row.rid, { pattern: row.schedule }, {
                syncRid: row.rid, trigger: 'schedule', triggeredBy: null,
            });
        }

        return DataConnectionDB.Sync.toDomain(row);
    }

    /** Syncs are listed with discover on the source (RLS); 404 if the source is hidden. */
    async list(principal: Principal, sourceRid: DataConnection.Source.Rid): Promise<DataConnection.Sync[]> {
        await this.sources.require(principal, sourceRid);

        const rows = await this.repository.listForSource(principal, sourceRid);

        return rows.map(DataConnectionDB.Sync.toDomain);
    }

    /** Queues a run now — a Redis job, so gated: write on the source and on the output dataset. Deduplicated per sync. */
    @SecurityGate('write')
    async run(principal: Principal, sourceRid: DataConnection.Source.Rid, syncRid: DataConnection.Sync.Rid): Promise<void> {
        const sync = await this.require(principal, sourceRid, syncRid);

        await this.gatekeeper.assert(principal, 'write', sync.output_dataset_rid);
        await this.catalog.get(principal, { rid: sync.output_dataset_rid });          // 404 if the output is trashed

        if (!sync.enabled)
            throw new BadRequestException('Sync is disabled');

        const queueDefinition = DataConnection.Queue.Sync.Definition;
        const job = { syncRid, trigger: 'manual' as const, triggeredBy: Principal.actorOf(principal) };

        await this.queueManager.add(queueDefinition, job, { deduplication: DataConnection.Queue.Sync.deduplication(syncRid) });
    }

    /** Every enabled sync with a schedule — the system worker mirrors them into BullMQ's job schedulers. */
    async scheduled(): Promise<{ rid: DataConnection.Sync.Rid; schedule: string }[]> {
        const rows = await this.repository.listScheduled(Principal.SELF('sync.scheduled'));

        return rows.map((row) => ({ rid: row.rid, schedule: row.schedule! }));
    }

    /** The sync, if it belongs to this source and the principal can discover it (RLS) — or 404. */
    async require(principal: Principal, sourceRid: DataConnection.Source.Rid, syncRid: DataConnection.Sync.Rid): Promise<DataConnectionDB.Sync.Row> {
        const sync = await this.repository.get(principal, syncRid);

        if (!sync || sync.source_rid !== sourceRid)
            throw new NotFoundException('Not found');

        return sync;
    }
}
