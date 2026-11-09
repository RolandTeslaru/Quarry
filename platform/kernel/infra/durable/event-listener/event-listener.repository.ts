import { Injectable } from '@nestjs/common';
import type { Durable } from '@quarry/shared/domain';
import { Principal } from '@quarry/platform-kernel/auth/principal';
import { Repository, Transactional } from '@quarry/platform-kernel/db/repository';
import { EventListenerDB } from './event-listener.db';

/** durable.event_listener, read as the service: written only by migrations. */
@Injectable()
export class EventListenerRepository extends Repository(EventListenerDB.database) {

    @Transactional('service')
    public async listByTopic(principal: Principal.Service, topic: Durable.Event.Topic): Promise<EventListenerDB.Listener.Row[]> {
        const rows = await this.trx
            .selectFrom('durable.event_listener')
            .selectAll()
            .where('topic', '=', topic)
            .execute();

        return rows.map((row) => EventListenerDB.Listener.Row.parse(row));
    }
}
