import { Injectable } from '@nestjs/common';
import { Principal } from '@/auth/principal';
import { Repository, Transactional } from '@/db/repository';
import { CatalogDB } from '../catalog.db';

/** catalog.outbox: events written in the same transaction as the change, relayed to BullMQ afterwards. */
@Injectable()
export class OutboxRepository extends Repository(CatalogDB.database) {

    @Transactional('service')
    async pending(principal: Principal.Service, limit: number): Promise<CatalogDB.Outbox.Row[]> {
        return this.trx
            .selectFrom('catalog.outbox')
            .selectAll()
            .where('published_at', 'is', null)
            .orderBy('id')
            .limit(limit)
            .execute();
    }

    @Transactional('service')
    async markPublished(principal: Principal.Service, ids: number[]): Promise<void> {
        if (ids.length === 0)
            return;

        await this.trx
            .updateTable('catalog.outbox')
            .set({ published_at: new Date() })
            .where('id', 'in', ids)
            .execute();
    }
}
