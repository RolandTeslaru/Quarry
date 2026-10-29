import { Processor } from '@nestjs/bullmq';
import { Forge, Stdio } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { JobProcessor } from '@quarry/shared/server/queue';
import { ForgeServerClient } from './forge-server.client';
import { JobContainers } from './job-containers';

/** How many jobs this machine runs at once — its slots. */
const SLOTS = Number(process.env.FORGE_AGENT_SLOTS ?? 2);

/** How often a running job's lease is renewed. */
const HEARTBEAT_INTERVAL_MS = 10_000;

/**
 * One attempt of one job, as the server hands it out:
 *
 *   claim (scheduled → running)  →  its runtime's container: ready, run  →  finish (succeeded | failed)
 *
 * The runtime does the work (docs/design/forge-runtimes.md). Meanwhile the lease is
 * renewed, and the container killed once the reply says stop.
 */
@Processor(Forge.Queue.RunJob.Definition.name, { concurrency: SLOTS })
export class RunJobProcessor extends JobProcessor<typeof Forge.Queue.RunJob.Definition> {

    protected readonly definition = Forge.Queue.RunJob.Definition;

    private readonly log = System.log.withContext('RunJob');

    constructor(
        private readonly forgeServer: ForgeServerClient,
        private readonly containers:  JobContainers,
    ) {
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

        const runtime = this.containers.start(job, recipe, (log) => this.log.info(log.line, {
            job:    job.rid,
            stream: log.stream,
        }));

        const heartbeats = setInterval(async () => {
            try {
                const heartbeat = await this.forgeServer.heartbeat(message);

                if (heartbeat.action === 'stop') {
                    this.log.info(`Stopping ${job.rid}: its build was canceled`);
                    await this.containers.kill(job);
                }
            }
            catch (error) {
                const reason = error instanceof Error ? error.message : String(error);

                this.log.warning(`Heartbeat for ${job.rid} failed`, { error: reason });
            }
        }, HEARTBEAT_INTERVAL_MS);

        let outcome: Stdio.Payload<Forge.Runtime.Run.Response>;

        try {
            await runtime.waitUntilReady(recipe.runtime.type);

            outcome = await runtime.request(Forge.Runtime.Run, {
                job,
                recipe,
            });
        }
        catch (error) {
            const reason = error instanceof Error ? error.message : String(error);

            outcome = {
                status:  'failed',
                failure: { message: reason },
            };
        }
        finally {
            clearInterval(heartbeats);
            runtime.close();
        }

        const finished = await this.forgeServer.finish(message, outcome);

        if (!finished) {
            this.log.info(`${job.rid} was canceled while it ran — its outcome is dropped`);

            return { status: 'skipped' };
        }

        this.log.info(`Finished ${job.rid}: ${outcome.status}`);

        return { status: outcome.status };
    }
}
