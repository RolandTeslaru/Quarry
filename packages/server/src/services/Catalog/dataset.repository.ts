import { Injectable } from '@nestjs/common';
import { Catalog, Library } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { Repository, Transactional } from '@/db/repository';
import { EnsureResource } from '@/services/Library/ensure-resource';
import { CatalogDB } from './catalog.db';

@Injectable()
export class DatasetRepository extends Repository(CatalogDB.database) {

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
}
