import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataConnection, Dataset, Identity, Storage } from '@quarry/shared/domain';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { FileStorage } from '@quarry/platform-kernel/infra/file-storage';
import { RealtimeService } from '@quarry/platform-kernel/services/Realtime/realtime.service';
import { GatekeeperService } from '@quarry/platform-kernel/services/Gatekeeper/gatekeeper.service';
import { CatalogClient } from '@quarry/platform-kernel/microservice/clients';
import { SecurityGate } from '@quarry/platform-kernel/services/Gatekeeper/security-gate';
import { DataConnectionDB } from '../data-connection.db';
import { SourceService } from '../source/source.service';
import { SourceRepository } from '../source/source.repository';
import { SyncService } from '../sync/sync.service';
import { SyncRepository } from '../sync/sync.repository';
import { syncDefinition } from '../sync/sync-definition';
import { SyncRunRepository } from './sync-run.repository';

/**
 * A sync's runs: the history for users; the lifecycle (start → heartbeat → complete / fail, and reap)
 * for the workers, through /internal.
 */
@Injectable()
export class SyncRunService {

    constructor(
        readonly gatekeeper:               GatekeeperService,
        private readonly sources:          SourceService,
        private readonly syncs:            SyncService,
        private readonly catalog:          CatalogClient,
        private readonly files:            FileStorage,
        private readonly repository:       SyncRunRepository,
        // A run loads its sync and source as the system, and skips (or names) what's gone — not a user's 404.
        private readonly syncRepository:   SyncRepository,
        private readonly sourceRepository: SourceRepository,
        private readonly realtime:         RealtimeService,
    ) {}

    /**
     * A sync's run history, newest first. Gated, not left to RLS: a discoverer
     * would otherwise get a silently empty history instead of a 403.
     */
    @SecurityGate('read')
    async list(principal: Principal, sourceRid: DataConnection.Source.Rid, syncRid: DataConnection.Sync.Rid): Promise<DataConnection.SyncRun[]> {
        await this.syncs.require(principal, sourceRid, syncRid);

        const rows = await this.repository.list(principal, syncRid);

        return rows.map(DataConnectionDB.SyncRun.toDomain);
    }

    /**
     * Begins a run: records it and opens the output dataset's transaction. The
     * system loads the sync; from there the run acts for whoever pressed run
     * (manual) or the sync's creator (scheduled) — Gatekeeper checks that
     * delegate, so a user who lost access — to the output dataset or to the
     * source's credential — stops their runs here.
     */
    async start(job: DataConnection.API.Internal.StartRun.Request): Promise<DataConnection.API.Internal.StartRun.Response> {
        const sync = await this.syncRepository.get(Principal.SELF('sync.start'), job.syncRid);

        if (!sync || !sync.enabled)
            return { skipped: true };

        const principal = runPrincipal(job.triggeredBy, sync);
        const source = await this.sourceRepository.get(principal, sync.source_rid);

        if (!source)
            throw new NotFoundException(`Source ${sync.source_rid} of sync ${sync.rid} is missing or trashed`);

        // The integration decides from the sync's config whether a run replaces the view or appends to it.
        const transactionType = syncDefinition(source).transactionType(sync.config);
        const stateFrom = await this.repository.latestState(principal, sync.rid);
        const runRid = DataConnection.SyncRun.createRid();

        await this.repository.start(principal, { rid: runRid, syncRid: sync.rid, trigger: job.trigger, triggeredBy: job.triggeredBy, stateFrom });
        await this.publish(runRid, sync);

        try {
            const credential = await this.sources.credentialOf(principal, source);
            const transaction = await this.catalog.openTransaction(principal, { datasetRid: sync.output_dataset_rid, type: transactionType, provenance: { syncRid: sync.rid, syncRunRid: runRid } });

            await this.repository.attachTransaction(principal, runRid, transaction.rid);

            return {
                skipped:        false,
                runRid,
                datasetRid:     sync.output_dataset_rid,
                transactionRid: transaction.rid,
                source,
                credential,
                syncConfig:     sync.config,
                state:          stateFrom,
                destination:    this.files.url(Dataset.getStoragePrefix(sync.output_dataset_rid, transaction.rid)),
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            await this.repository.fail(Principal.SELF('sync.start'), runRid, { reason: 'error', message });
            await this.publish(runRid, sync);
            this.notifyFailure(job.triggeredBy, sync, message);

            throw error;
        }
    }

    async heartbeat(runRid: DataConnection.SyncRun.Rid): Promise<void> {
        await this.repository.heartbeat(Principal.SELF('sync.heartbeat'), runRid);
    }

    /**
     * The copy is done: registers what's actually under the transaction's prefix
     * (listed here, not taken from the worker — so nothing outside it can be
     * registered), with the worker's row counts and schema, then commits.
     */
    async complete(runRid: DataConnection.SyncRun.Rid, request: DataConnection.API.Internal.CompleteRun.Request): Promise<DataConnection.API.Internal.CompleteRun.Response> {
        const { run, sync } = await this.requireRunning(runRid);
        const principal = runPrincipal(run.triggered_by, sync);
        const datasetRid = sync.output_dataset_rid;
        const transactionRid = run.transaction_rid!;
        const prefix = Dataset.getStoragePrefix(datasetRid, transactionRid);

        const changes = (await this.files.list(prefix))
            .filter((object) => Storage.File.formatOf(object.key) === 'parquet')
            .map((object) => ({
                op:          'add' as const,
                logicalPath: object.key.slice(`${datasetRid}/`.length),     // <transaction>/data_N.parquet — unique per transaction
                format:      'parquet' as const,
                key:         object.key,
                bytes:       object.bytes,
                rowCount:    request.rowCounts[object.key] ?? null,
            }));

        await this.catalog.registerChanges(principal, { datasetRid, transactionRid, changes });
        await this.catalog.commitTransaction(principal, { datasetRid, transactionRid, schema: request.schema });
        await this.repository.succeed(principal, runRid, { stateTo: request.state, rowCount: request.rowCount });
        await this.publish(runRid, sync);

        return { transactionRid, files: changes.length };
    }

    /** Aborts the transaction and fails the run — as the system, so it works even if the delegate lost access. */
    async fail(runRid: DataConnection.SyncRun.Rid, message: string): Promise<void> {
        const self = Principal.SELF('sync.fail');
        const { run, sync } = await this.requireRunning(runRid);

        if (run.transaction_rid)
            await this.catalog.abortTransaction(self, { datasetRid: sync.output_dataset_rid, transactionRid: run.transaction_rid });

        await this.repository.fail(self, runRid, { reason: 'error', message });
        await this.publish(runRid, sync);
        this.notifyFailure(run.triggered_by, sync, message);
    }

    /** Runs still `running` with a heartbeat older than `staleMinutes` lost their worker: fail them, abort their transactions. */
    async reap(staleMinutes: number): Promise<number> {
        const self = Principal.SELF('sync.reap');
        const stuck = await this.repository.stuck(self, staleMinutes);

        for (const run of stuck) {
            await this.repository.fail(self, run.rid, { reason: 'worker lost' });

            if (run.transaction_rid)
                await this.catalog.abortTransaction(self, { datasetRid: run.output_dataset_rid, transactionRid: run.transaction_rid });

            const sync = await this.syncRepository.get(self, run.sync_rid);

            await this.publish(run.rid, sync!);
            this.notifyFailure(run.triggered_by, sync!, 'The worker running it stopped responding.');
        }

        return stuck.length;
    }

    /** The run as it is now, to everyone on its source's channel (who can discover the source — the gateway checks). */
    private async publish(runRid: DataConnection.SyncRun.Rid, sync: DataConnectionDB.Sync.Row): Promise<void> {
        const run = await this.repository.get(Principal.SELF('sync.publish'), runRid);

        this.realtime.emitEvent({
            ...DataConnection.Event.create('data-connection:run:updated', { run: DataConnectionDB.SyncRun.toDomain(run!) }),
            channel: DataConnection.Event.getChannel(sync.source_rid),
        });
    }

    /** Tells whoever the run acted for — who pressed run, or the sync's creator for a scheduled run — on their own channel. */
    private notifyFailure(triggeredBy: Identity.User.Rid | null, sync: DataConnectionDB.Sync.Row, message: string): void {
        const userRid = triggeredBy ?? sync.created_by;

        if (!userRid)
            return;

        this.realtime.emitEvent({
            ...Identity.Event.create('identity:notification', {
                level:       'error',
                title:       `Sync "${sync.name}" failed`,
                description: message,
            }),
            channel: Identity.Event.getChannel(userRid),
        });
    }

    private async requireRunning(runRid: DataConnection.SyncRun.Rid) {
        const self = Principal.SELF('sync.load');
        const run = await this.repository.get(self, runRid);

        if (!run)
            throw new NotFoundException('Not found');

        if (run.status !== 'running')
            throw new ConflictException(`Run is ${run.status}`);

        const sync = await this.syncRepository.get(self, run.sync_rid);

        return { run, sync: sync! };
    }
}

/** Manual runs act for whoever pressed run; scheduled ones for the sync's creator. */
function runPrincipal(triggeredBy: DataConnection.SyncRun['triggeredBy'], sync: DataConnectionDB.Sync.Row): Principal {
    return Principal.onBehalfOf(triggeredBy ?? sync.created_by, `sync:${sync.rid}`);
}
