import { Injectable } from '@nestjs/common';
import { DataConnection, Dataset } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { Repository, Transactional } from '@/db/repository';
import { json } from '@/db/table';
import { DataConnectionDB } from '../data-connection.db';

/** data_connection.sync. Reached through DataConnectionRepository. */
@Injectable()
export class SyncRepository extends Repository(DataConnectionDB.database) {
    /** Source and output dataset are top-level, so @Transactional checks both are live. */
    @Transactional()
    async create(principal: Principal, sourceRid: DataConnection.Source.Rid, outputDatasetRid: Dataset.Rid, values: {
        rid:      DataConnection.Sync.Rid;
        name:     string;
        config:   DataConnection.Sync.Config;            // already validated against the integration's sync Config
        schedule: string | null;
    }): Promise<DataConnectionDB.Sync.Row> {
        return this.trx
            .insertInto('data_connection.sync')
            .values({
                rid:               values.rid,
                source_rid:        sourceRid,
                name:              values.name,
                config:            json(values.config),
                output_dataset_rid: outputDatasetRid,
                schedule:          values.schedule,
                created_by:        Principal.actorOf(principal),
            })
            .returningAll()
            .executeTakeFirstOrThrow();
    }

    @Transactional()
    async get(principal: Principal, rid: DataConnection.Sync.Rid): Promise<DataConnectionDB.Sync.Row | null> {
        const row = await this.trx
            .selectFrom('data_connection.sync')
            .selectAll()
            .where('rid', '=', rid)
            .executeTakeFirst();

        return row ?? null;
    }

    @Transactional()
    async listForSource(principal: Principal, sourceRid: DataConnection.Source.Rid): Promise<DataConnectionDB.Sync.Row[]> {
        return this.trx
            .selectFrom('data_connection.sync')
            .selectAll()
            .where('source_rid', '=', sourceRid)
            .orderBy('name')
            .execute();
    }

    /** Every enabled sync with a schedule — what the BullMQ job schedulers should mirror. */
    @Transactional('service')
    async listScheduled(principal: Principal.Service): Promise<Pick<DataConnectionDB.Sync.Row, 'rid' | 'schedule'>[]> {
        return this.trx
            .selectFrom('data_connection.sync')
            .select(['rid', 'schedule'])
            .where('enabled', '=', true)
            .where('schedule', 'is not', null)
            .execute();
    }
}
