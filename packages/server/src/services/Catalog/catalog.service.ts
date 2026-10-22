import { Injectable, NotFoundException } from '@nestjs/common';
import { Catalog } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { FileStorage } from '@/infra/file-storage';
import { GatekeeperService } from '@/services/Gatekeeper/gatekeeper.service';
import { SecurityGate } from '@/services/Gatekeeper/security-gate';
import { DatasetRepository } from './dataset.repository';
import { OutboxRepository } from './outbox/outbox.repository';
import { DatasetFiles } from './files/dataset-files';
import { DatasetTransactions } from './transaction/dataset-transactions';
import { TransactionRepository } from './transaction/transaction.repository';

/**
 * Catalog's one entry point for other services: datasets here, their write
 * protocol under `transaction` (catalog.transaction.open / registerChanges /
 * commit / abort), uploads, previews and schema edits under `files`.
 */
@Injectable()
export class CatalogService {

    constructor(
        readonly gatekeeper:                    GatekeeperService,
        readonly transaction:                   DatasetTransactions,
        readonly files:                         DatasetFiles,
        private readonly datasetRepository:     DatasetRepository,
        private readonly transactionRepository: TransactionRepository,
        private readonly outboxRepository:      OutboxRepository,
        private readonly storage:               FileStorage,
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

    /**
     * Gated, not left to RLS: a discoverer can read the branch but not the
     * transactions, so RLS alone would answer with a silently empty view — and
     * the view hands out storage keys.
     */
    @SecurityGate('read')
    async view(principal: Principal, rid: Catalog.Dataset.Rid, sequence?: number): Promise<Catalog.Dataset.View.Schema> {
        await this.get(principal, rid);

        return this.transactionRepository.resolveView(principal, rid, 'main', sequence);
    }

    // ── housekeeping — called by the system worker through /internal ───

    /** Unpublished outbox events, oldest first — the system worker relays them to BullMQ. */
    async pendingEvents(limit: number): Promise<{ id: number; event: string; payload: Record<string, unknown> }[]> {
        const rows = await this.outboxRepository.pending(Principal.SELF('catalog.outbox'), limit);

        return rows.map((row) => ({ id: row.id, event: row.event, payload: row.payload }));
    }

    async markPublished(ids: number[]): Promise<void> {
        await this.outboxRepository.markPublished(Principal.SELF('catalog.outbox'), ids);
    }

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
            filesDeleted += await this.storage.deletePrefix(this.transaction.storagePrefix(transaction.dataset_rid, transaction.rid));

        return { aborted: aborted.length, filesDeleted };
    }
}
