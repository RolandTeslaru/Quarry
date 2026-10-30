import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Catalog, Library, type Platform } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { FileStorage } from '@/infra/file-storage';
import { GatekeeperService } from '@/services/Gatekeeper/gatekeeper.service';
import { SecurityGate } from '@/services/Gatekeeper/security-gate';
import { Audit } from '@/services/Audit/audit.decorator';
import { AuditService } from '@/services/Audit/audit.service';
import { LibraryService } from '@/services/Library/library.service';
import { DatasetRepository } from './dataset.repository';
import { CatalogStorage } from './storage/catalog-storage.service';
import { DatasetTransactions } from './transaction/dataset-transactions';
import { TransactionRepository } from './transaction/transaction.repository';

/**
 * Catalog's one entry point for other services: datasets here, their write
 * protocol under `transaction` (catalog.transaction.open / registerChanges /
 * commit / abort), uploads, previews and schema edits under `storage` (CatalogStorage).
 */
@Injectable()
export class CatalogService {

    constructor(
        readonly gatekeeper:                    GatekeeperService,
        readonly audit:                         AuditService,
        readonly transaction:                   DatasetTransactions,
        readonly storage:                       CatalogStorage,
        private readonly datasetRepository:     DatasetRepository,
        private readonly transactionRepository: TransactionRepository,
        private readonly files:                 FileStorage,
        private readonly library:               LibraryService,
    ) {}

    /** Creating = writing into the parent folder — RLS's call on the insert. */
    async createDataset(principal: Principal, request: Catalog.API.Dataset.Create.Request): Promise<Catalog.Dataset.Schema> {
        return this.datasetRepository.create(principal, {
            rid:         Catalog.Dataset.createRid(),
            name:        request.name,
            description: request.description,
            parentRid:   request.parentRid,
        });
    }

    /** Datasets the principal can discover (RLS). */
    async list(principal: Principal): Promise<Catalog.Dataset.Schema[]> {
        return this.datasetRepository.list(principal);
    }

    async get(principal: Principal, rid: Catalog.Dataset.Rid): Promise<Catalog.Dataset.Schema> {
        const dataset = await this.datasetRepository.get(principal, rid);

        if (!dataset)
            throw new NotFoundException('Not found');

        return dataset;
    }

    /** A dataset by RID or library path. */
    async getByReference(principal: Principal, reference: string): Promise<Catalog.Dataset.Schema> {
        const rid = Catalog.Dataset.Rid.safeParse(reference);

        if (rid.success)
            return this.get(principal, rid.data);

        const resource = await this.library.getByPath(principal, reference);

        return this.get(principal, Catalog.Dataset.Rid.parse(resource.rid));
    }

    /** A dataset by RID or library path — or, for a path nothing is at yet, a new empty one there. */
    async getOrCreateByReference(principal: Principal, reference: string): Promise<Catalog.Dataset.Schema> {
        const rid = Catalog.Dataset.Rid.safeParse(reference);

        if (rid.success)
            return this.get(principal, rid.data);

        const existing = await this.library.findByPath(principal, reference);

        if (existing)
            return this.get(principal, Catalog.Dataset.Rid.parse(existing.rid));

        const destination = await this.library.getDestination(principal, reference);

        return this.createDataset(principal, { ...destination, description: null });
    }

    /**
     * Gated, not left to RLS: a discoverer can read the branch but not the
     * transactions, so RLS alone would answer with a silently empty view — and
     * the view hands out storage keys.
     */
    @Audit('read', (sequence?: number) => ({ op: 'view', sequence: sequence ?? null }))
    @SecurityGate('read')
    async view(principal: Principal, rid: Catalog.Dataset.Rid, sequence?: number): Promise<Catalog.Dataset.View.Schema> {
        return this.transactionRepository.resolveView(principal, rid, 'main', sequence);
    }

    /**
     * An app opening the dataset's page: the dataset and its latest view, with
     * the audit `open` recorded in the same transaction. Gated like view (it
     * hands out storage keys); only users open pages.
     */
    @SecurityGate('read')
    async open(principal: Principal, rid: Catalog.Dataset.Rid, application: Platform.Application.Id): Promise<Catalog.API.Dataset.Open.Response> {
        if (principal.type !== 'user')
            throw new ForbiddenException('Only users open pages');

        const opened = await this.datasetRepository.open(principal, rid, application);

        if (!opened)
            throw new NotFoundException('Not found');

        return opened;
    }

    // ── housekeeping — called by the system worker through /internal ───

    /**
     * Aborts transactions left open longer than `staleOpenHours`, then deletes the
     * storage prefix of every transaction aborted in the last `sweepAbortedDays`
     * (idempotent — an already-swept prefix lists empty).
     */
    async storageGc(staleOpenHours: number, sweepAbortedDays: number): Promise<{ aborted: number; filesDeleted: number }> {
        const self = Principal.SELF('catalog.storageGc');
        const aborted = await this.transactionRepository.abortStale(self, staleOpenHours);
        const sweep = await this.transactionRepository.recentlyAborted(self, sweepAbortedDays);

        let filesDeleted = 0;

        for (const transaction of sweep)
            filesDeleted += await this.files.deletePrefix(Catalog.Dataset.getStoragePrefix(transaction.dataset_rid, transaction.rid));

        return { aborted: aborted.length, filesDeleted };
    }
}
