import * as path from 'node:path';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Catalog, Dataset, Foundations, Library, type Platform } from '@quarry/shared/domain';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { FileStorage } from '@quarry/platform-kernel/infra/file-storage';
import { GatekeeperService } from '@quarry/platform-kernel/services/Gatekeeper/gatekeeper.service';
import { SecurityGate } from '@quarry/platform-kernel/services/Gatekeeper/security-gate';
import { Audit } from '@quarry/platform-kernel/services/Audit/audit.decorator';
import { AuditService } from '@quarry/platform-kernel/services/Audit/audit.service';
import { LibraryService } from '@quarry/platform-kernel/services/Library/library.service';
import { DatasetRepository } from './dataset.repository';
import { CatalogStorage, type IncomingFile, requireFormat } from './storage/catalog-storage.service';
import { TransactionService } from '../transaction/transaction.service';

/**
 * Catalog's entry point for other services: datasets here; uploads, previews and schema edits
 * under `storage` (CatalogStorage). Writes are TransactionService's (src/transaction).
 */
@Injectable()
export class CatalogService {

    constructor(
        readonly gatekeeper:                    GatekeeperService,
        readonly audit:                         AuditService,
        readonly storage:                       CatalogStorage,
        private readonly datasetRepository:     DatasetRepository,
        private readonly transaction:           TransactionService,
        private readonly files:                 FileStorage,
        private readonly library:               LibraryService,
    ) {}

    /** Creating = writing into the parent folder — RLS's call on the insert. */
    async createDataset(principal: Principal, request: Catalog.API.Dataset.Create.Request): Promise<Dataset> {
        return this.datasetRepository.create(principal, {
            rid:         Dataset.createRid(),
            name:        request.name,
            description: request.description,
            parentRid:   request.parentRid,
        });
    }

    /** A new dataset from a file, named after it unless a name is given. Trashed again if the file can't be stored or read. */
    async createFromFile(
        principal: Principal,
        fields:    Catalog.API.Dataset.Upload.NewFields,
        file:      IncomingFile,
    ): Promise<Catalog.API.Dataset.Upload.Response> {
        const filename = requireFormat(file);
        // "sales 2026.csv" → "sales 2026"
        const stem = path.parse(filename).name.trim() || filename;

        const dataset = await this.datasetRepository.create(principal, {
            rid:         Dataset.createRid(),
            name:        fields.name ?? stem.slice(0, 255),
            description: fields.description,
            parentRid:   fields.parentRid,
        });

        try {
            return await this.storage.upload(principal, dataset.rid, 'snapshot', file);
        }
        catch (error) {
            // A failed trash leaves an empty dataset behind: the upload's own error is the one to report.
            try {
                await this.library.trash(principal, dataset.rid);
            }
            catch {}

            throw error;
        }
    }

    /** Datasets the principal can discover (RLS). */
    async list(principal: Principal): Promise<Dataset[]> {
        return this.datasetRepository.list(principal);
    }

    async get(principal: Principal, rid: Dataset.Rid): Promise<Dataset> {
        const dataset = await this.datasetRepository.get(principal, rid);

        if (!dataset)
            throw new NotFoundException('Not found');

        return dataset;
    }

    /** Each of these has data — a committed version — or a conflict, naming the first that hasn't. NotFound for one the principal can't see. */
    async assertNotEmpty(principal: Principal, rids: Set<Dataset.Rid>): Promise<void> {
        for (const rid of rids) {
            const dataset = await this.get(principal, rid);

            if (dataset.lastSequence === 0)
                throw new ConflictException(`${rid} has no data yet`);
        }
    }

    /** A dataset by RID or library path. */
    async getByReference(principal: Principal, reference: string): Promise<Dataset> {
        const rid = Dataset.Rid.safeParse(reference);

        if (rid.success)
            return this.get(principal, rid.data);

        const resource = await this.library.getByPath(principal, reference);

        return this.get(principal, Dataset.Rid.parse(resource.rid));
    }

    /** A dataset by RID or library path — or, for a path nothing is at yet, a new empty one there. */
    async getOrCreateByReference(principal: Principal, reference: string): Promise<Dataset> {
        const rid = Dataset.Rid.safeParse(reference);

        if (rid.success)
            return this.get(principal, rid.data);

        const existing = await this.library.findByPath(principal, reference);

        if (existing)
            return this.get(principal, Dataset.Rid.parse(existing.rid));

        const destination = await this.library.getDestination(principal, reference);

        return this.createDataset(principal, { ...destination, description: null });
    }

    /**
     * Gated, not left to RLS: a discoverer can read the branch but not the
     * transactions, so RLS alone would answer with a silently empty view — and
     * the view hands out storage keys.
     */
    @Audit('read', (sequence?: Dataset.Sequence) => ({ op: 'view', sequence: sequence ?? null }))
    @SecurityGate('read')
    async view(principal: Principal, rid: Dataset.Rid, sequence?: Dataset.Sequence): Promise<Dataset.View> {
        return this.transaction.resolveView(principal, rid, Foundations.MAIN_BRANCH, sequence);
    }

    /**
     * An app opening the dataset's page: the dataset and its latest view, with
     * the audit `open` recorded in the same transaction. Gated like view (it
     * hands out storage keys); only users open pages.
     */
    @SecurityGate('read')
    async open(principal: Principal, rid: Dataset.Rid, application: Platform.Application.Id): Promise<Catalog.API.Dataset.Open.Response> {
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
        const aborted = await this.transaction.abortStale(self, staleOpenHours);
        const sweep = await this.transaction.getRecentlyAborted(self, sweepAbortedDays);

        let filesDeleted = 0;

        for (const transaction of sweep)
            filesDeleted += await this.files.deletePrefix(Dataset.getStoragePrefix(transaction.dataset_rid, transaction.rid));

        return { aborted: aborted.length, filesDeleted };
    }
}
