import { Body, Controller, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { Foundations } from '@quarry/shared/domain';
import { Internal } from '@/auth/current-principal';
import { Principal } from '@/auth/principal';
import { ZodPipe } from '@/http/zod.pipe';
import { DurableQueues } from './durable-queues';
import { OutboxRepository } from './outbox.repository';

import API = Foundations.DurableQueue.API;

/** Workers only (`/api/internal/durable-queues/…`, service token): the sweep's minute, and acks from consumers without a take step. */
@Internal()
@Controller('internal/durable-queues')
export class DurableQueueInternalController {

    constructor(
        private readonly durableQueues: DurableQueues,
        private readonly outbox:        OutboxRepository,
    ) {}

    @Post('sweep')
    @HttpCode(200)
    public async sweep(): Promise<API.Sweep.Response> {
        return { relayed: await this.durableQueues.sweep() };
    }

    @Post(':name/ack')
    @HttpCode(204)
    public async ack(
        @Param('name', new ZodPipe(Foundations.Queue.Name)) name: Foundations.Queue.Name,
        @Body(new ZodPipe(API.Ack.Request)) body: API.Ack.Request,
    ): Promise<void> {
        if (!this.durableQueues.get(name))
            throw new NotFoundException(`No durable queue ${name}`);

        await this.outbox.ackAlone(Principal.SELF('durable-queue.ack'), name, [body.jobId]);
    }
}
