import { Injectable } from '@nestjs/common';
import { Catalog } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { GatekeeperService } from '@/services/Gatekeeper/gatekeeper.service';
import { SecurityGate } from '@/services/Gatekeeper/security-gate';
import { CatalogDB } from '../catalog.db';
import { TransactionRepository } from './transaction.repository';

/**
 * The dataset write protocol: open → upload under `storagePrefix` →
 * registerChanges → commit, or abort. Reached as `catalog.transaction` — not
 * exported from CatalogModule, so CatalogService stays Catalog's one entry point.
 *
 * Writers only ever add files. Nothing here deletes bytes: a `remove` only
 * drops a logical path from the view, and storage GC alone deletes objects.
 *
 * A transaction is always addressed through its dataset (datasetRid, then
 * transactionRid), so @SecurityGate checks the dataset and @Transactional its
 * liveness; the repository 404s if the transaction isn't that dataset's.
 */
@Injectable()
export class DatasetTransactions {

    constructor(
        readonly gatekeeper:         GatekeeperService,
        private readonly repository: TransactionRepository,
    ) {}

    /** Where a transaction's files go in the bucket. Physical keys are write-once. */
    storagePrefix(datasetRid: Catalog.Dataset.Rid, transactionRid: Catalog.Transaction.Rid): string {
        return `${datasetRid}/${transactionRid}/`;
    }

    @SecurityGate('write')
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

    @SecurityGate('write')
    /** Adds stored files to the transaction (or removes logical paths from the view). */
    async registerChanges(
        principal:      Principal,
        datasetRid:     Catalog.Dataset.Rid,
        transactionRid: Catalog.Transaction.Rid,
        changes:        Catalog.Transaction.FileChange.Schema[],
    ): Promise<void> {
        await this.repository.registerChanges(principal, datasetRid, transactionRid, changes);
    }

    @SecurityGate('write')
    async commit(
        principal:      Principal,
        datasetRid:     Catalog.Dataset.Rid,
        transactionRid: Catalog.Transaction.Rid,
        schema:         Catalog.ColumnSchema.Schema | null,
    ): Promise<number> {
        const row = await this.repository.commit(principal, datasetRid, transactionRid, schema);

        return row.sequence!;
    }

    /** Works on a trashed dataset — aborting is how a writer cleans up after one. */
    @SecurityGate('write')
    async abort(principal: Principal, datasetRid: Catalog.Dataset.Rid, transactionRid: Catalog.Transaction.Rid): Promise<void> {
        await this.repository.abort(principal, datasetRid, transactionRid);
    }
}
