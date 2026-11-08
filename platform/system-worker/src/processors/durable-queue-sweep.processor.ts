import { Processor } from '@nestjs/bullmq';
import { Durable } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { api, getCodeWorkspaceApi, getForgeApi } from '@quarry/shared/server/internal-api';
import { JobProcessor } from '@quarry/shared/server/queue';

/** Every durable queue's sweep: the main server, Forge and Code Workspaces — each relays its own queues — send again what's unsent or stale in the outbox. */
@Processor(Durable.Queue.Sweep.Definition.name, { concurrency: 1 })
export class DurableQueueSweepProcessor extends JobProcessor<typeof Durable.Queue.Sweep.Definition> {

    protected readonly definition = Durable.Queue.Sweep.Definition;

    private readonly log = System.log.withContext('DurableQueueSweep');

    protected async handle(): Promise<Durable.Queue.Sweep.Result> {
        const main = await Durable.Queue.API.sweep(api);
        const forge = await Durable.Queue.API.sweep(getForgeApi());
        const codeWorkspace = await Durable.Queue.API.sweep(getCodeWorkspaceApi());
        const result = { relayed: main.relayed + forge.relayed + codeWorkspace.relayed };

        if (result.relayed > 0)
            this.log.info(`Relayed ${result.relayed} outbox message(s)`);

        return result;
    }
}
