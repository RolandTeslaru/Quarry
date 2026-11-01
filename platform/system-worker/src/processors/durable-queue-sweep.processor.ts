import { Processor } from '@nestjs/bullmq';
import { Foundations } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { api, getCodeWorkspaceApi, getForgeApi } from '@quarry/shared/server/internal-api';
import { JobProcessor } from '@quarry/shared/server/queue';

/** Every durable queue's sweep: the main server, Forge and Code Workspaces — each relays its own queues — send again what's unsent or stale in the outbox. */
@Processor(Foundations.DurableQueue.Sweep.Definition.name, { concurrency: 1 })
export class DurableQueueSweepProcessor extends JobProcessor<typeof Foundations.DurableQueue.Sweep.Definition> {

    protected readonly definition = Foundations.DurableQueue.Sweep.Definition;

    private readonly log = System.log.withContext('DurableQueueSweep');

    protected async handle(): Promise<Foundations.DurableQueue.Sweep.Result> {
        const main = await Foundations.DurableQueue.API.sweep(api);
        const forge = await Foundations.DurableQueue.API.sweep(getForgeApi());
        const codeWorkspace = await Foundations.DurableQueue.API.sweep(getCodeWorkspaceApi());
        const result = { relayed: main.relayed + forge.relayed + codeWorkspace.relayed };

        if (result.relayed > 0)
            this.log.info(`Relayed ${result.relayed} outbox message(s)`);

        return result;
    }
}
