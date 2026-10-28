import { z } from 'zod';
import { Foundations } from '@quarry/shared/domain';
import { defineDatabase } from '@/db/pool';
import type { Table } from '@/db/table';

/** foundations.outbox: durable queues' messages, from added until acked. */
export namespace OutboxDB {

    export namespace Message {
        export const Row = z.object({
            id:         z.coerce.number().int(),
            queue_name: Foundations.Queue.Name,
            job_id:     z.string(),
            payload:    z.unknown(),
            created_at: z.date(),
            sent_at:    z.date().nullable(),
            sends:      z.number().int(),
        });
        export type Row = z.infer<typeof Row>;
    }

    export interface Tables {
        'foundations.outbox': Table<typeof Message.Row, 'id' | 'created_at' | 'sent_at' | 'sends'>;
    }

    export const database = defineDatabase<Tables>();
}
