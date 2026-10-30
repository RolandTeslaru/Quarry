import { Injectable } from '@nestjs/common';
import { Dataset, Foundations, Library, type Platform } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { Repository, Transactional } from '@/db/repository';
import { EnsureResource } from '@/services/Library/ensure-resource';
import { isLive } from '@/db/liveness';
import { AuditRepository } from '@/services/Audit/audit.repository';
import { ResourceRepository } from '@/services/Library/resource.repository';
import { CatalogDB } from './catalog.db';
import { TransactionRepository } from './transaction/transaction.repository';

@Injectable()
export class DatasetRepository extends Repository(CatalogDB.database) {

    constructor(
        readonly resources:            ResourceRepository,          // @EnsureResource's
        private readonly transactions: TransactionRepository,
        private readonly audit:        AuditRepository,
    ) {
        super();
    }

    /** Library row (via @EnsureResource) + dataset row + branch `main`, in one transaction. */
    @Transactional()
    @EnsureResource('dataset')
    async create(principal: Principal, values: {
        rid:         Dataset.Rid;
        name:        string;
        description: string | null;
        parentRid:   Library.Resource.Rid;
    }): Promise<Dataset.Schema> {
        const dataset = await this.trx
            .insertInto('catalog.dataset')
            .values({ rid: values.rid })
            .returningAll()
            .executeTakeFirstOrThrow();

        await this.trx
            .insertInto('catalog.branch')
            .values({ dataset_rid: values.rid, name: Foundations.MAIN_BRANCH })
            .execute();

        return CatalogDB.Dataset.toDomain(dataset, this.resource, Dataset.Sequence.parse(0));  // nothing committed yet
    }

    /** Live datasets only — trashed resources read as absent. */
    @Transactional()
    async get(principal: Principal, rid: Dataset.Rid): Promise<Dataset.Schema | null> {
        const row = await this.trx
            .selectFrom('catalog.dataset as d')
            .innerJoin('library.resource as r', 'r.rid', 'd.rid')
            .innerJoin('catalog.branch as b', (join) => join.onRef('b.dataset_rid', '=', 'd.rid').on('b.name', '=', Foundations.MAIN_BRANCH))
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
    async open(principal: Principal.User, rid: Dataset.Rid, application: Platform.Application.Id): Promise<{ dataset: Dataset.Schema; view: Dataset.View.Schema } | null> {
        const dataset = await this.get(principal, rid);              // joins this transaction

        if (!dataset)
            return null;

        const view = await this.transactions.resolveView(principal, rid, Foundations.MAIN_BRANCH);      // joins this transaction

        await this.audit.recordOpen(principal, { rid, type: 'dataset', application });   // joins this transaction

        return { dataset, view };
    }

    /** Every live dataset the user can discover (RLS), across projects. */
    @Transactional()
    async list(principal: Principal): Promise<Dataset.Schema[]> {
        const rows = await this.trx
            .selectFrom('catalog.dataset as d')
            .innerJoin('library.resource as r', 'r.rid', 'd.rid')
            .innerJoin('catalog.branch as b', (join) => join.onRef('b.dataset_rid', '=', 'd.rid').on('b.name', '=', Foundations.MAIN_BRANCH))
            .selectAll('r')
            .select(['d.rid as dataset_rid', 'b.last_sequence'])
            .where(isLive('r.rid'))
            .orderBy('r.name')
            .execute();

        return rows.map(({ dataset_rid, last_sequence, ...resource }) =>
            CatalogDB.Dataset.toDomain({ rid: dataset_rid, type: 'dataset' }, resource, last_sequence));
    }
}
