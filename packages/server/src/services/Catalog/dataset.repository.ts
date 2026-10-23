import { Injectable } from '@nestjs/common';
import { Catalog, Library, type Platform } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { Repository, Transactional } from '@/db/repository';
import { EnsureResource } from '@/services/Library/ensure-resource';
import { isLive, trashResource } from '@/services/Library/library.statements';
import { AuditRepository } from '@/services/Audit/audit.repository';
import { CatalogDB } from './catalog.db';
import { TransactionRepository } from './transaction/transaction.repository';

@Injectable()
export class DatasetRepository extends Repository(CatalogDB.database) {

    constructor(
        private readonly transactions: TransactionRepository,
        private readonly audit:        AuditRepository,
    ) {
        super();
    }

    /** Library row (via @EnsureResource) + dataset row + branch `main`, in one transaction. */
    @Transactional()
    @EnsureResource('dataset')
    async create(principal: Principal, values: {
        rid:         Catalog.Dataset.Rid;
        name:        string;
        description: string | null;
        parentRid:   Library.Resource.Rid;
    }): Promise<Catalog.Dataset.Schema> {
        const dataset = await this.trx
            .insertInto('catalog.dataset')
            .values({ rid: values.rid })
            .returningAll()
            .executeTakeFirstOrThrow();

        await this.trx
            .insertInto('catalog.branch')
            .values({ dataset_rid: values.rid, name: 'main' })
            .execute();

        return CatalogDB.Dataset.toDomain(dataset, this.resource, 0);
    }


    /** Undoes a create that couldn't be finished (an upload that failed) — the library row goes to the trash. */
    @Transactional()
    async trash(principal: Principal, rid: Catalog.Dataset.Rid): Promise<void> {
        await trashResource(this.trx, rid, Principal.actorOf(principal));
    }

    /** Live datasets only — trashed resources read as absent. */
    @Transactional()
    async get(principal: Principal, rid: Catalog.Dataset.Rid): Promise<Catalog.Dataset.Schema | null> {
        const row = await this.trx
            .selectFrom('catalog.dataset as d')
            .innerJoin('library.resource as r', 'r.rid', 'd.rid')
            .innerJoin('catalog.branch as b', (join) => join.onRef('b.dataset_rid', '=', 'd.rid').on('b.name', '=', 'main'))
            .selectAll('r')
            .select('b.last_sequence')
            .where('d.rid', '=', rid)
            .where('r.trashed_at', 'is', null)
            .executeTakeFirst();

        if (!row)
            return null;

        const { last_sequence, ...resource } = row;

        return CatalogDB.Dataset.toDomain({ rid, type: 'dataset' }, resource, last_sequence);
    }

    /**
     * An app opening the dataset's page: the dataset, its latest view on `main`,
     * and the audit `open` — one transaction, so a page is never shown
     * unrecorded. Null: not there, or not the user's to see (nothing recorded).
     */
    @Transactional('user')
    async open(principal: Principal.User, rid: Catalog.Dataset.Rid, application: Platform.Application.Id): Promise<{ dataset: Catalog.Dataset.Schema; view: Catalog.Dataset.View.Schema } | null> {
        const dataset = await this.get(principal, rid);              // joins this transaction

        if (!dataset)
            return null;

        const view = await this.transactions.resolveView(principal, rid, 'main');      // joins this transaction

        await this.audit.recordOpen(principal, { rid, type: 'dataset', application });   // joins this transaction

        return { dataset, view };
    }

    /** Every live dataset the user can discover (RLS), across projects. */
    @Transactional()
    async list(principal: Principal): Promise<Catalog.Dataset.Schema[]> {
        const rows = await this.trx
            .selectFrom('catalog.dataset as d')
            .innerJoin('library.resource as r', 'r.rid', 'd.rid')
            .innerJoin('catalog.branch as b', (join) => join.onRef('b.dataset_rid', '=', 'd.rid').on('b.name', '=', 'main'))
            .selectAll('r')
            .select(['d.rid as dataset_rid', 'b.last_sequence'])
            .where(isLive('r.rid'))
            .orderBy('r.name')
            .execute();

        return rows.map(({ dataset_rid, last_sequence, ...resource }) =>
            CatalogDB.Dataset.toDomain({ rid: dataset_rid, type: 'dataset' }, resource, last_sequence));
    }
}
