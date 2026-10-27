import { Processor } from '@nestjs/bullmq';
import { Forge } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { api } from '@quarry/shared/server/internal-api';
import { JobProcessor } from '@quarry/shared/server/queue';

/** A queued job no ForgeAgent started within this long is sent again — Redis may have lost it. */
const STALE_QUEUED_MINUTES = 2;

/** Forge's relay sweep: the server re-sends what the relay's fast path didn't deliver. */
@Processor(Forge.Queue.RelaySweep.Definition.name, { concurrency: 1 })
export class ForgeRelaySweepProcessor extends JobProcessor<typeof Forge.Queue.RelaySweep.Definition> {

    protected readonly definition = Forge.Queue.RelaySweep.Definition;

    private readonly log = System.log.withContext('ForgeRelaySweep');

    protected async handle(): Promise<Forge.Queue.RelaySweep.Result> {
        const result = await Forge.API.Internal.relaySweep(api, { staleQueuedMinutes: STALE_QUEUED_MINUTES });

        if (result.relayed > 0)
            this.log.info(`Relayed ${result.relayed} job(s)`);

        return result;
    }
}
