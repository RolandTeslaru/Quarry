import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'kysely';
import { Catalog } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { AllowTrashed, Repository, Transactional } from '@/db/repository';
import { liveResources } from '@/db/liveness';
import { json } from '@/db/table';
import { CatalogDB } from '../catalog.db';

/** The dataset write protocol (open → register → commit / abort) and view resolution. */
@Injectable()
export class TransactionRepository extends Repository(CatalogDB.database) {

    @Transactional()
    async open(principal: Principal, datasetRid: Catalog.Dataset.Rid, values: {
        rid:        Catalog.Transaction.Rid;
        branch:     string;
        type:       Catalog.Transaction.Type;
        provenance: Record<string, unknown>;
    }): Promise<CatalogDB.Transaction.Row> {
        // transaction_one_open: a second writer on the same branch fails here with 23505 → Conflict.
        return this.trx
            .insertInto('catalog.transaction')
            .values({
                rid:        values.rid,
                dataset_rid: datasetRid,
                branch:     values.branch,
                type:       values.type,
                provenance: json(values.provenance),
                started_by: Principal.actorOf(principal),
            })
            .returningAll()
            .executeTakeFirstOrThrow();
    }

    /**
     * Opens one transaction on each dataset, all or none. Datasets are inside
     * the payload, so their liveness is checked here; one already being
     * written is a conflict, named (transaction_one_open is the backstop).
     */
    @Transactional()
    public async openBatch(principal: Principal, branch: string, values: {
        rid:        Catalog.Transaction.Rid;
        datasetRid: Catalog.Dataset.Rid;
        type:       Catalog.Transaction.Type;
        provenance: Record<string, unknown>;
    }[]): Promise<CatalogDB.Transaction.Row[]> {
        if (values.length === 0)
            return [];

        const datasetRids = values.map((value) => value.datasetRid);

        if (new Set(datasetRids).size !== datasetRids.length)
            throw new BadRequestException('A dataset is opened twice');

        const live = await liveResources(this.trx, datasetRids);

        if (datasetRids.some((rid) => !live.has(rid)))
            throw new NotFoundException('Not found');

        const busy = await this.trx
            .selectFrom('catalog.transaction')
            .select('dataset_rid')
            .where('dataset_rid', 'in', datasetRids)
            .where('branch', '=', branch)
            .where('status', '=', 'open')
            .executeTakeFirst();

        if (busy)
            throw new ConflictException(`${busy.dataset_rid} is already being written`);

        return this.trx
            .insertInto('catalog.transaction')
            .values(values.map((value) => ({
                rid:         value.rid,
                dataset_rid: value.datasetRid,
                branch,
                type:        value.type,
                provenance:  json(value.provenance),
                started_by:  Principal.actorOf(principal),
            })))
            .returningAll()
            .execute();
    }

    @Transactional()
    async registerChanges(
        principal:      Principal,
        datasetRid:     Catalog.Dataset.Rid,
        rid:            Catalog.Transaction.Rid,
        changes:        Catalog.Transaction.FileChange.Schema[],
    ): Promise<void> {
        await this._requireOpen(datasetRid, rid);

        if (changes.length === 0)
            return;

        await this.trx
            .insertInto('catalog.transaction_change')
            .values(changes.map((change) => CatalogDB.TransactionChange.fromDomain(rid, change)))
            .execute();
    }

    /**
     * Commits: next sequence on the branch (row lock serialises commits),
     * status committed, outbox event — all in one transaction.
     */
    @Transactional()
    async commit(
        principal:      Principal,
        datasetRid:     Catalog.Dataset.Rid,
        rid:            Catalog.Transaction.Rid,
        schema:         Catalog.ColumnSchema.Schema | null,
    ): Promise<CatalogDB.Transaction.Row> {
        const transaction = await this._requireOpen(datasetRid, rid);

        const branch = await this.trx
            .selectFrom('catalog.branch')
            .select('last_sequence')
            .where('dataset_rid', '=', transaction.dataset_rid)
            .where('name', '=', transaction.branch)
            .forUpdate()
            .executeTakeFirstOrThrow();

        const sequence = branch.last_sequence + 1;

        await this.trx
            .updateTable('catalog.branch')
            .set({ last_sequence: sequence })
            .where('dataset_rid', '=', transaction.dataset_rid)
            .where('name', '=', transaction.branch)
            .execute();

        const committed = await this.trx
            .updateTable('catalog.transaction')
            .set({ status: 'committed', sequence, schema: schema ? json(schema) : null, finished_at: new Date() })
            .where('rid', '=', rid)
            .where('status', '=', 'open')
            .returningAll()
            .executeTakeFirstOrThrow();

        await this.trx
            .insertInto('catalog.outbox')
            .values({
                event:   'dataset.updated',
                payload: json({ datasetRid: transaction.dataset_rid, branch: transaction.branch, sequence, transactionRid: rid }),
            })
            .execute();

        await sql`select pg_notify('catalog_outbox', '')`.execute(this.trx);

        return committed;
    }

    /**
     * No-op if already finished — abort is called from failure paths that may race.
     * The dataset may be trashed: aborting is how a writer cleans up after one.
     */
    @Transactional()
    async abort(principal: Principal, @AllowTrashed() datasetRid: Catalog.Dataset.Rid, rid: Catalog.Transaction.Rid): Promise<boolean> {
        const result = await this.trx
            .updateTable('catalog.transaction')
            .set({ status: 'aborted', finished_at: new Date() })
            .where('rid', '=', rid)
            .where('dataset_rid', '=', datasetRid)
            .where('status', '=', 'open')
            .executeTakeFirst();

        return Number(result.numUpdatedRows) > 0;
    }

    /**
     * The file set at `sequence` (default: the branch's head): the latest
     * committed snapshot at or before it, then every later committed
     * transaction in order, applied by logical path.
     */
    @Transactional()
    async resolveView(principal: Principal, datasetRid: Catalog.Dataset.Rid, branch: string, sequence?: number): Promise<Catalog.Dataset.View.Schema> {
        const head = sequence ?? (await this.trx
            .selectFrom('catalog.branch')
            .select('last_sequence')
            .where('dataset_rid', '=', datasetRid)
            .where('name', '=', branch)
            .executeTakeFirstOrThrow()).last_sequence;

        if (head === 0)
            return { branch, sequence: 0, schema: null, files: [], rowCount: 0 };

        const committed = this.trx
            .selectFrom('catalog.transaction')
            .where('dataset_rid', '=', datasetRid)
            .where('branch', '=', branch)
            .where('status', '=', 'committed')
            .where('sequence', '<=', head);

        const snapshot = await committed
            .select((eb) => eb.fn.max('sequence').as('sequence'))
            .where('type', '=', 'snapshot')
            .executeTakeFirst();

        const from = snapshot?.sequence ?? 1;

        const changes = await this.trx
            .selectFrom('catalog.transaction as t')
            .innerJoin('catalog.transaction_change as c', 'c.transaction_rid', 't.rid')
            .selectAll('c')
            .where('t.dataset_rid', '=', datasetRid)
            .where('t.branch', '=', branch)
            .where('t.status', '=', 'committed')
            .where('t.sequence', '>=', from)
            .where('t.sequence', '<=', head)
            .orderBy('t.sequence')
            .execute();

        const view = new Map<string, Catalog.Dataset.View.File>();

        for (const change of changes)
            if (change.op === 'remove')
                view.delete(change.logical_path);
            else
                view.set(change.logical_path, { ...CatalogDB.TransactionChange.toFile(change), logicalPath: change.logical_path });

        const latestSchema = await committed
            .select('schema')
            .where('schema', 'is not', null)
            .orderBy('sequence', 'desc')
            .limit(1)
            .executeTakeFirst();

        const list = [...view.values()];
        // Known only if every file is a Parquet file that reported its rows.
        const counts = list.map((file) => (file.format === 'parquet' ? file.rowCount : null));
        const rowCount = counts.every((count) => count !== null)
            ? counts.reduce<number>((sum, count) => sum + (count ?? 0), 0)
            : null;

        return { branch, sequence: head, schema: latestSchema?.schema ?? null, files: list, rowCount };
    }

    // ── housekeeping ────────────────────────────────────────────────────

    /** Aborts transactions left open longer than `hours`; returns their RIDs. */
    @Transactional('service')
    async abortStale(principal: Principal.Service, hours: number): Promise<Catalog.Transaction.Rid[]> {
        const rows = await this.trx
            .updateTable('catalog.transaction')
            .set({ status: 'aborted', finished_at: new Date() })
            .where('status', '=', 'open')
            .where('started_at', '<', sql<Date>`now() - make_interval(hours => ${hours})`)
            .returning('rid')
            .execute();

        return rows.map((row) => row.rid);
    }

    /** Transactions aborted within the last `days` — their storage prefixes are swept (idempotently). */
    @Transactional('service')
    async recentlyAborted(principal: Principal.Service, days: number): Promise<Pick<CatalogDB.Transaction.Row, 'rid' | 'dataset_rid'>[]> {
        return this.trx
            .selectFrom('catalog.transaction')
            .select(['rid', 'dataset_rid'])
            .where('status', '=', 'aborted')
            .where('finished_at', '>', sql<Date>`now() - make_interval(days => ${days})`)
            .execute();
    }

    /**
     * The transaction, locked, if it belongs to this dataset and is still open.
     * (The dataset's liveness was checked by @Transactional — it's a top-level
     * argument — so a dataset trashed mid-write takes no more files or commits.)
     */
    private async _requireOpen(datasetRid: Catalog.Dataset.Rid, rid: Catalog.Transaction.Rid): Promise<CatalogDB.Transaction.Row> {
        const row = await this.trx
            .selectFrom('catalog.transaction')
            .selectAll()
            .where('rid', '=', rid)
            .where('dataset_rid', '=', datasetRid)
            .forUpdate()
            .executeTakeFirst();

        if (!row)
            throw new NotFoundException('Not found');

        if (row.status !== 'open')
            throw new ConflictException(`Transaction is ${row.status}`);

        return row;
    }
}
