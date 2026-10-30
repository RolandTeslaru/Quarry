import { Injectable } from '@nestjs/common';
import { Catalog } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { CatalogDB } from '../catalog.db';
import { TransactionRepository } from './transaction.repository';

/**
 * The dataset write protocol: open → upload under `Catalog.Dataset.getStoragePrefix` →
 * registerChanges → commit, or abort. Reached as `catalog.transaction` — not
 * exported from CatalogModule, so CatalogService stays Catalog's one entry point.
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
export class DatasetTransactions {

    constructor(private readonly repository: TransactionRepository) {}

    async open(
        principal:  Principal,
        datasetRid: Catalog.Dataset.Rid,
        type:       Catalog.Transaction.Type,
        provenance: Record<string, unknown> = {},
        branch = 'main',
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
        openings:  { datasetRid: Catalog.Dataset.Rid; type: Catalog.Transaction.Type; provenance?: Record<string, unknown> }[],
        branch = 'main',
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
        datasetRid:     Catalog.Dataset.Rid,
        transactionRid: Catalog.Transaction.Rid,
        changes:        Catalog.Transaction.FileChange.Schema[],
    ): Promise<void> {
        await this.repository.registerChanges(principal, datasetRid, transactionRid, changes);
    }

    async commit(
        principal:      Principal,
        datasetRid:     Catalog.Dataset.Rid,
        transactionRid: Catalog.Transaction.Rid,
        schema:         Catalog.ColumnSchema.Schema | null,
    ): Promise<number> {
        return this.repository.commit(principal, datasetRid, transactionRid, schema);
    }

    /** Aborts the open ones among these, in one database transaction; finished ones are skipped, so it's safe to repeat. */
    public async abortBatch(principal: Principal, transactions: Pick<Catalog.Transaction.Schema, 'rid' | 'datasetRid'>[]): Promise<void> {
        await this.repository.abortBatch(principal, transactions);
    }

    /** Works on a trashed dataset — aborting is how a writer cleans up after one. */
    async abort(principal: Principal, datasetRid: Catalog.Dataset.Rid, transactionRid: Catalog.Transaction.Rid): Promise<void> {
        await this.repository.abort(principal, datasetRid, transactionRid);
    }
}
