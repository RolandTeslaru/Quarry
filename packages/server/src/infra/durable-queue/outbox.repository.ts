import { Injectable } from '@nestjs/common';
import { sql, type Transaction } from 'kysely';
import type { Foundations } from '@quarry/shared/domain';
import { Principal } from '@/auth/principal';
import { Repository, Transactional, currentTransaction } from '@/db/repository';
import { json } from '@/db/table';
import { OutboxDB } from './outbox.db';

export interface OutboxMessage {
    readonly payload: unknown;
    readonly jobId:   string;
}

/**
 * foundations.outbox. `add` and `ack` join the caller's transaction — that's the
 * point: a message exists exactly when the change that calls for it does. The
 * relay's reads and marks run as the service.
 */
@Injectable()
export class OutboxRepository extends Repository(OutboxDB.database) {

    /** Inside a @Transactional method only. A job id already in the outbox is ignored. */
    public async add(queueName: Foundations.Queue.Name, messages: OutboxMessage[]): Promise<void> {
        if (messages.length === 0)
            return;

        await getOpenTransaction()
            .insertInto('foundations.outbox')
            .values(messages.map((message) => ({ queue_name: queueName, job_id: message.jobId, payload: json(message.payload) })))
            .onConflict((conflict) => conflict.columns(['queue_name', 'job_id']).doNothing())
            .execute();
    }

    /** Inside a @Transactional method only: the work was taken or canceled — stop sending it. */
    public async ack(queueName: Foundations.Queue.Name, jobIds: string[]): Promise<void> {
        if (jobIds.length === 0)
            return;

        await sql`select foundations.ack_outbox(${queueName}, ${jobIds}::text[])`.execute(getOpenTransaction());
    }

    /** The same, in a transaction of its own — for consumers acking through the internal API. */
    @Transactional('service')
    public async ackAlone(principal: Principal.Service, queueName: Foundations.Queue.Name, jobIds: string[]): Promise<void> {
        await this.ack(queueName, jobIds);
    }

    /** What to send: never sent, or sent over `staleSentMinutes` ago (0: only never sent). Oldest first. */
    @Transactional('service')
    public async listToSend(principal: Principal.Service, queueName: Foundations.Queue.Name, staleSentMinutes: number | null): Promise<OutboxDB.Message.Row[]> {
        let query = this.trx
            .selectFrom('foundations.outbox')
            .selectAll()
            .where('queue_name', '=', queueName);

        query = staleSentMinutes === null
            ? query.where('sent_at', 'is', null)
            : query.where((eb) => eb.or([
                eb('sent_at', 'is', null),
                eb('sent_at', '<', sql<Date>`now() - make_interval(mins => ${staleSentMinutes})`),
            ]));

        const rows = await query.orderBy('id').execute();

        return rows.map((row) => OutboxDB.Message.Row.parse(row));
    }

    /** Sent: `sent_at = now()`, one more send. False if it was acked meanwhile. */
    @Transactional('service')
    public async markSent(principal: Principal.Service, id: number): Promise<OutboxDB.Message.Row | null> {
        const row = await this.trx
            .updateTable('foundations.outbox')
            .set({ sent_at: new Date(), sends: sql<number>`sends + 1` })
            .where('id', '=', id)
            .returningAll()
            .executeTakeFirst();

        return row ? OutboxDB.Message.Row.parse(row) : null;
    }

    /** Queues with messages waiting that nothing has registered — a removed queue, a typo. */
    @Transactional('service')
    public async listUnknownQueues(principal: Principal.Service, known: Foundations.Queue.Name[]): Promise<{ queueName: string; messages: number }[]> {
        let query = this.trx
            .selectFrom('foundations.outbox')
            .select(['queue_name', (eb) => eb.fn.countAll<string>().as('messages')])
            .groupBy('queue_name');

        if (known.length > 0)
            query = query.where('queue_name', 'not in', known);

        const rows = await query.execute();

        return rows.map((row) => ({ queueName: row.queue_name, messages: Number(row.messages) }));
    }
}

function getOpenTransaction(): Transaction<OutboxDB.Tables> {
    return currentTransaction() as unknown as Transaction<OutboxDB.Tables>;
}
