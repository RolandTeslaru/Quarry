import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { Catalog, DataConnection, Identity } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { Repository, Transactional } from '@/db/repository';
import { json } from '@/db/table';
import { DataConnectionDB } from '../data-connection.db';

/** data_connection.sync_run. Reached through DataConnectionRepository. */
@Injectable()
export class SyncRunRepository extends Repository(DataConnectionDB.database) {

    @Transactional()
    async get(principal: Principal, rid: DataConnection.SyncRun.Rid): Promise<DataConnectionDB.SyncRun.Row | null> {
        const row = await this.trx
            .selectFrom('data_connection.sync_run')
            .selectAll()
            .where('rid', '=', rid)
            .executeTakeFirst();

        return row ?? null;
    }
    /** sync_run_one_running: a second concurrent run of the same sync fails here (23505 → Conflict). */
    @Transactional()
    async start(principal: Principal, values: {
        rid:         DataConnection.SyncRun.Rid;
        syncRid:      DataConnection.Sync.Rid;
        trigger:     DataConnection.SyncRun.Trigger;
        triggeredBy: Identity.User.Rid | null;
        stateFrom:   string | null;
    }): Promise<DataConnectionDB.SyncRun.Row> {
        return this.trx
            .insertInto('data_connection.sync_run')
            .values({
                rid:          values.rid,
                sync_rid:     values.syncRid,
                trigger:      values.trigger,
                triggered_by: values.triggeredBy,
                state_from:   values.stateFrom,
            })
            .returningAll()
            .executeTakeFirstOrThrow();
    }

    @Transactional()
    async attachTransaction(principal: Principal, rid: DataConnection.SyncRun.Rid, transactionRid: Catalog.Transaction.Rid): Promise<void> {
        await this.trx
            .updateTable('data_connection.sync_run')
            .set({ transaction_rid: transactionRid, heartbeat_at: new Date() })
            .where('rid', '=', rid)
            .execute();
    }

    @Transactional()
    async heartbeat(principal: Principal, rid: DataConnection.SyncRun.Rid): Promise<void> {
        await this.trx
            .updateTable('data_connection.sync_run')
            .set({ heartbeat_at: new Date() })
            .where('rid', '=', rid)
            .where('status', '=', 'running')
            .execute();
    }

    @Transactional()
    async succeed(principal: Principal, rid: DataConnection.SyncRun.Rid, values: { stateTo: string | null; rowCount: number }): Promise<void> {
        await this.trx
            .updateTable('data_connection.sync_run')
            .set({ status: 'succeeded', state_to: values.stateTo, row_count: values.rowCount, finished_at: new Date() })
            .where('rid', '=', rid)
            .where('status', '=', 'running')
            .execute();
    }

    @Transactional()
    async fail(principal: Principal, rid: DataConnection.SyncRun.Rid, error: { reason: string; message?: string }): Promise<void> {
        await this.trx
            .updateTable('data_connection.sync_run')
            .set({ status: 'failed', error: json(error), finished_at: new Date() })
            .where('rid', '=', rid)
            .where('status', '=', 'running')
            .execute();
    }

    /** What the next run starts from: state_to of the latest succeeded run. */
    @Transactional()
    async latestState(principal: Principal, syncRid: DataConnection.Sync.Rid): Promise<string | null> {
        const row = await this.trx
            .selectFrom('data_connection.sync_run')
            .select('state_to')
            .where('sync_rid', '=', syncRid)
            .where('status', '=', 'succeeded')
            .orderBy('started_at', 'desc')
            .limit(1)
            .executeTakeFirst();

        return row?.state_to ?? null;
    }

    @Transactional()
    async list(principal: Principal, syncRid: DataConnection.Sync.Rid, limit = 50): Promise<DataConnectionDB.SyncRun.Row[]> {
        return this.trx
            .selectFrom('data_connection.sync_run')
            .selectAll()
            .where('sync_rid', '=', syncRid)
            .orderBy('started_at', 'desc')
            .limit(limit)
            .execute();
    }

    /** Running, but no heartbeat for `minutes` — the worker is gone. */
    @Transactional('service')
    async stuck(principal: Principal.Service, minutes: number): Promise<(DataConnectionDB.SyncRun.Row & { output_dataset_rid: Catalog.Dataset.Rid })[]> {
        return this.trx
            .selectFrom('data_connection.sync_run as r')
            .innerJoin('data_connection.sync as s', 's.rid', 'r.sync_rid')
            .selectAll('r')
            .select('s.output_dataset_rid')                 // a transaction is addressed through its dataset
            .where('r.status', '=', 'running')
            .where('r.heartbeat_at', '<', sql<Date>`now() - make_interval(mins => ${minutes})`)
            .execute();
    }
}
