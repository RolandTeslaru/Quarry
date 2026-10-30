import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'kysely';
import { Catalog, Dataset, Foundations } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { AllowTrashed, Repository, Transactional } from '@/db/repository';
import { liveResources } from '@/db/liveness';
import { json } from '@/db/table';
import { CatalogDB } from '../catalog.db';

/** The dataset write protocol (open → register → commit / abort) and view resolution. */
@Injectable()
export class TransactionRepository extends Repository(CatalogDB.database) {

    @Transactional()
    async open(principal: Principal, datasetRid: Dataset.Rid, values: {
        rid:        Catalog.Transaction.Rid;
        branch:     Foundations.Branch;
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
    public async openBatch(principal: Principal, branch: Foundations.Branch, values: {
        rid:        Catalog.Transaction.Rid;
        datasetRid: Dataset.Rid;
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
        datasetRid:     Dataset.Rid,
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
     * Adds one file to an open transaction whose files all share one schema — a job's output: the first file's
     * schema is staged on the transaction (committed with it by `commitBatch`); a later file must have the same
     * columns. The transaction's row lock serialises files registered at once.
     */
    @Transactional()
    async registerFile(
        principal:  Principal,
        datasetRid: Dataset.Rid,
        rid:        Catalog.Transaction.Rid,
        file:       Catalog.Transaction.FileChange.Schema,
        schema:     Catalog.ColumnSchema.Schema,
    ): Promise<void> {
        const transaction = await this._requireOpen(datasetRid, rid);

        if (!transaction.schema) {
            await this.trx
                .updateTable('catalog.transaction')
                .set({ schema: json(schema) })
                .where('rid', '=', rid)
                .execute();
        }
        else if (JSON.stringify(transaction.schema.columns) !== JSON.stringify(schema.columns)) {
            throw new BadRequestException(`${file.logicalPath} doesn't have the same columns as the output's other files`);
        }

        await this.trx
            .insertInto('catalog.transaction_change')
            .values(CatalogDB.TransactionChange.fromDomain(rid, file))
            .execute();
    }

    /** Commits these open transactions in this database transaction, each with the schema staged on it (`registerFile`). */
    @Transactional()
    async commitBatch(
        principal:    Principal,
        transactions: { rid: Catalog.Transaction.Rid; datasetRid: Dataset.Rid }[],
    ): Promise<void> {
        for (const transaction of transactions) {
            const { schema } = await this._requireOpen(transaction.datasetRid, transaction.rid);

            await this.commit(principal, transaction.datasetRid, transaction.rid, schema);
        }
    }

    /**
     * Commits: next sequence on the branch (row lock serialises commits),
     * status committed, outbox event — all in one transaction.
     */
    @Transactional()
    async commit(
        principal:      Principal,
        datasetRid:     Dataset.Rid,
        rid:            Catalog.Transaction.Rid,
        schema:         Catalog.ColumnSchema.Schema | null,
    ): Promise<Dataset.Sequence> {
        const transaction = await this._requireOpen(datasetRid, rid);

        const branch = await this.trx
            .selectFrom('catalog.branch')
            .select('last_sequence')
            .where('dataset_rid', '=', transaction.dataset_rid)
            .where('name', '=', transaction.branch)
            .forUpdate()
            .executeTakeFirstOrThrow();

        const sequence = Dataset.Sequence.parse(branch.last_sequence + 1);

        await this.trx
            .updateTable('catalog.branch')
            .set({ last_sequence: sequence })
            .where('dataset_rid', '=', transaction.dataset_rid)
            .where('name', '=', transaction.branch)
            .execute();

        await this.trx
            .updateTable('catalog.transaction')
            .set({ status: 'committed', sequence, schema: schema ? json(schema) : null, finished_at: new Date() })
            .where('rid', '=', rid)
            .where('status', '=', 'open')
            .returning('rid')
            .executeTakeFirstOrThrow();


        return sequence;
    }

    /**
     * Aborts the open ones among these transactions, in one database transaction;
     * finished ones are left alone (no-op), so it's safe to repeat. Each is
     * addressed through its dataset, which may be trashed.
     */
    @Transactional()
    public async abortBatch(principal: Principal, transactions: { rid: Catalog.Transaction.Rid; datasetRid: Dataset.Rid }[]): Promise<void> {
        if (transactions.length === 0)
            return;

        await this.trx
            .updateTable('catalog.transaction')
            .set({ status: 'aborted', finished_at: new Date() })
            .where((eb) => eb.or(transactions.map((transaction) => eb.and([
                eb('rid', '=', transaction.rid),
                eb('dataset_rid', '=', transaction.datasetRid),
            ]))))
            .where('status', '=', 'open')
            .execute();
    }

    /**
     * No-op if already finished — abort is called from failure paths that may race.
     * The dataset may be trashed: aborting is how a writer cleans up after one.
     */
    @Transactional()
    async abort(principal: Principal, @AllowTrashed() datasetRid: Dataset.Rid, rid: Catalog.Transaction.Rid): Promise<boolean> {
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
    async resolveView(principal: Principal, datasetRid: Dataset.Rid, branch: Foundations.Branch, sequence?: Dataset.Sequence): Promise<Dataset.View.Schema> {
        const head = sequence ?? (await this.trx
            .selectFrom('catalog.branch')
            .select('last_sequence')
            .where('dataset_rid', '=', datasetRid)
            .where('name', '=', branch)
            .executeTakeFirstOrThrow()).last_sequence;

        if (head === 0)
            return { branch, sequence: head, schema: null, files: [], rowCount: 0 };

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

        const from = snapshot?.sequence ?? Dataset.Sequence.parse(1);

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

        const view = new Map<string, Dataset.View.File>();

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
        let rowCount: number | null = 0;

        for (const file of list) {
            if (file.format !== 'parquet' || file.rowCount === null) {
                rowCount = null;
                break;
            }

            rowCount += file.rowCount;
        }

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
    private async _requireOpen(datasetRid: Dataset.Rid, rid: Catalog.Transaction.Rid): Promise<CatalogDB.Transaction.Row> {
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
