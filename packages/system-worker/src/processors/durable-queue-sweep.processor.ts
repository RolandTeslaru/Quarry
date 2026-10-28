import { Processor } from '@nestjs/bullmq';
import { Foundations } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { api } from '@quarry/shared/server/internal-api';
import { JobProcessor } from '@quarry/shared/server/queue';

/** Every durable queue's sweep, in one call: the server sends again what's unsent or stale in the outbox. */
@Processor(Foundations.DurableQueue.Sweep.Definition.name, { concurrency: 1 })
export class DurableQueueSweepProcessor extends JobProcessor<typeof Foundations.DurableQueue.Sweep.Definition> {

    protected readonly definition = Foundations.DurableQueue.Sweep.Definition;

    private readonly log = System.log.withContext('DurableQueueSweep');

    protected async handle(): Promise<Foundations.DurableQueue.Sweep.Result> {
        const result = await Foundations.DurableQueue.API.sweep(api);

        if (result.relayed > 0)
            this.log.info(`Relayed ${result.relayed} outbox message(s)`);

        return result;
    }
}
