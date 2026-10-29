import { Processor } from '@nestjs/bullmq';
import { Forge } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { JobProcessor } from '@quarry/shared/server/queue';
import { ForgeServerClient } from './forge-server.client';

/** How many jobs this machine runs at once — its slots. */
const SLOTS = Number(process.env.FORGE_AGENT_SLOTS ?? 2);

/**
 * One attempt of one job, as the server hands it out:
 *
 *   claim (scheduled → running)  →  run  →  finish (succeeded | failed)
 *
 * Scaffold: there's no compute yet. "Run" is a single heartbeat — the server
 * aborts the job's outputs on finish rather than committing them.
 */
@Processor(Forge.Queue.RunJob.Definition.name, { concurrency: SLOTS })
export class RunJobProcessor extends JobProcessor<typeof Forge.Queue.RunJob.Definition> {

    protected readonly definition = Forge.Queue.RunJob.Definition;

    private readonly log = System.log.withContext('RunJob');

    constructor(private readonly forgeServer: ForgeServerClient) {
        super();
    }

    protected async handle(message: Forge.Queue.RunJob.Job): Promise<Forge.Queue.RunJob.Result> {
        const claimed = await this.forgeServer.claim(message);

        if (!claimed) {
            this.log.info(`Skipped ${message.jobRid} (attempt ${message.attempt}): not waiting to be claimed`);
            
            return { status: 'skipped' };
        }

        const { job, recipe } = claimed;

        this.log.info(`Picked up ${message.jobRid} (attempt ${message.attempt})`, {
            build:     job.buildRid,
            recipe:    recipe.rid,
            transform: recipe.runtime.transform,
            outputs:   Object.keys(job.outputs).length,
        });

        const heartbeat = await this.forgeServer.heartbeat(message);

        if (heartbeat.action === 'stop') {
            this.log.info(`Stopped ${message.jobRid}: its build was canceled`);

            return { status: 'skipped' };
        }

        const finished = await this.forgeServer.finish(message, 'succeeded');

        if (!finished) {
            this.log.info(`${message.jobRid} was canceled while it ran — its outcome is dropped`);

            return { status: 'skipped' };
        }

        this.log.info(`Finished ${message.jobRid}: succeeded`);

        return { status: 'succeeded' };
    }
}
