import { z } from 'zod';
import { Durable, Foundations } from '@quarry/shared/domain';
import { defineDatabase } from '@quarry/platform-kernel/db/pool';
import type { Table } from '@quarry/platform-kernel/db/table';

/** durable.event_listener: who listens to which durable event — each row declared by the listener's migration. */
export namespace EventListenerDB {

    export namespace Listener {
        export const Row = z.object({
            topic:      Durable.Event.Topic,
            queue_name: Foundations.Queue.Name,
        });
        export type Row = z.infer<typeof Row>;
    }

    export interface Tables {
        'durable.event_listener': Table<typeof Listener.Row>;
    }

    export const database = defineDatabase<Tables>();
}
