import { Injectable } from '@nestjs/common';
import { Catalog, Dataset, Foundations } from '@quarry/shared/domain';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { CatalogDB } from '../catalog/catalog.db';
import { TransactionRepository } from './transaction.repository';

/**
 * The dataset write protocol: open → upload under `Dataset.getStoragePrefix` →
 * registerChanges → commit, or abort. Its own module (TransactionModule), beside Catalog;
 * other services inject TransactionService.
 *
 * Writers only ever add files. Nothing here deletes bytes: a `remove` only
 * drops a logical path from the view, and storage GC alone deletes objects.
 *
 * A transaction is always addressed through its dataset (datasetRid, then
 * transactionRid): RLS needs write on that dataset for every step, and
 * @Transactional checks it's live; the repository 404s if the transaction isn't
 * that dataset's.
 */
@Injectable()
export class TransactionService {

    constructor(private readonly repository: TransactionRepository) {}

    async open(
        principal:  Principal,
        datasetRid: Dataset.Rid,
        type:       Catalog.Transaction.Type,
        provenance: Record<string, unknown> = {},
        branch = Foundations.MAIN_BRANCH,
    ): Promise<Catalog.Transaction.Schema> {
        const row = await this.repository.open(principal, datasetRid, {
            rid:        Catalog.Transaction.createRid(),
            branch,
            type,
            provenance,
        });

        return CatalogDB.Transaction.toDomain(row);
    }

    /**
     * One transaction on each dataset, in one database transaction: all open,
     * or none (a dataset already being written is a 409). In the order given.
     */
    public async openBatch(
        principal: Principal,
        openings:  { datasetRid: Dataset.Rid; type: Catalog.Transaction.Type; provenance?: Record<string, unknown> }[],
        branch = Foundations.MAIN_BRANCH,
    ): Promise<Catalog.Transaction.Schema[]> {
        const values = openings.map((opening) => ({
            rid:        Catalog.Transaction.createRid(),
            datasetRid: opening.datasetRid,
            type:       opening.type,
            provenance: opening.provenance ?? {},
        }));

        const rows = await this.repository.openBatch(principal, branch, values);
        const byRid: Record<Catalog.Transaction.Rid, Catalog.Transaction.Schema> = {};

        for (const row of rows)
            byRid[row.rid] = CatalogDB.Transaction.toDomain(row);

        return values.map((value) => byRid[value.rid]);
    }

    /** Adds stored files to the transaction (or removes logical paths from the view). */
    async registerChanges(
        principal:      Principal,
        datasetRid:     Dataset.Rid,
        transactionRid: Catalog.Transaction.Rid,
        changes:        Catalog.Transaction.FileChange.Schema[],
    ): Promise<void> {
        await this.repository.registerChanges(principal, datasetRid, transactionRid, changes);
    }

    /**
     * Adds one file to an open transaction whose files all share one schema — a job's output; the first
     * file's schema is staged on the transaction and committed with it by `commitBatch`.
     */
    async registerFile(
        principal:      Principal,
        datasetRid:     Dataset.Rid,
        transactionRid: Catalog.Transaction.Rid,
        file:           Catalog.Transaction.FileChange.Schema,
        schema:         Catalog.ColumnSchema.Schema,
    ): Promise<void> {
        await this.repository.registerFile(principal, datasetRid, transactionRid, file, schema);
    }

    async commit(
        principal:      Principal,
        datasetRid:     Dataset.Rid,
        transactionRid: Catalog.Transaction.Rid,
        schema:         Catalog.ColumnSchema.Schema | null,
    ): Promise<Dataset.Sequence> {
        return this.repository.commit(principal, datasetRid, transactionRid, schema);
    }

    /** Commits these open transactions in one database transaction (or the caller's), each with the schema staged on it. */
    async commitBatch(principal: Principal, transactions: Pick<Catalog.Transaction.Schema, 'rid' | 'datasetRid'>[]): Promise<void> {
        await this.repository.commitBatch(principal, transactions);
    }

    /** Aborts the open ones among these, in one database transaction; finished ones are skipped, so it's safe to repeat. */
    public async abortBatch(principal: Principal, transactions: Pick<Catalog.Transaction.Schema, 'rid' | 'datasetRid'>[]): Promise<void> {
        await this.repository.abortBatch(principal, transactions);
    }

    /** Works on a trashed dataset — aborting is how a writer cleans up after one. */
    async abort(principal: Principal, datasetRid: Dataset.Rid, transactionRid: Catalog.Transaction.Rid): Promise<void> {
        await this.repository.abort(principal, datasetRid, transactionRid);
    }

    /**
     * The file set at `sequence` (default: the branch's head). Not gated: a user reads a view through
     * `catalog.view`, which is; the callers here have checked already.
     */
    async resolveView(principal: Principal, datasetRid: Dataset.Rid, branch: Foundations.Branch, sequence?: Dataset.Sequence): Promise<Dataset.View.Schema> {
        return this.repository.resolveView(principal, datasetRid, branch, sequence);
    }

    /** Aborts transactions left open longer than `hours`; returns their RIDs. */
    async abortStale(principal: Principal.Service, hours: number): Promise<Catalog.Transaction.Rid[]> {
        return this.repository.abortStale(principal, hours);
    }

    /** Transactions aborted within the last `days` — their storage prefixes are swept (idempotently). */
    async getRecentlyAborted(principal: Principal.Service, days: number): Promise<Pick<CatalogDB.Transaction.Row, 'rid' | 'dataset_rid'>[]> {
        return this.repository.recentlyAborted(principal, days);
    }
}
