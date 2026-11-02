import { Processor } from '@nestjs/bullmq';
import { isAxiosError } from 'axios';
import { Forge, Stdio } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { JobProcessor } from '@quarry/shared/server/queue';
import { ForgeMicroserviceAPIClient } from '../clients/forge-microservice-api.client';
import { JobContainers } from './job-containers';

/** How many jobs this machine runs at once — its slots. */
const SLOTS = Number(process.env.FORGE_AGENT_SLOTS ?? 2);

/** How often a running job's lease is renewed. */
const HEARTBEAT_INTERVAL_MS = 10_000;

/**
 * One attempt of one job, as Forge hands it out:
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
        private readonly api:        ForgeMicroserviceAPIClient,
        private readonly containers: JobContainers,
    ) {
        super();
    }

    protected async handle(message: Forge.Queue.RunJob.Job): Promise<Forge.Queue.RunJob.Result> {
        let claimed: Forge.API.Agent.Claim.Response;

        try {
            claimed = await this.api.claim(message);
        }
        catch (error) {
            // 409: this attempt isn't waiting to be claimed — a duplicate message, or a canceled build.
            if (isAxiosError(error) && error.response?.status === 409) {
                this.log.info(`Skipped ${message.jobRid} (attempt ${message.attempt}): not waiting to be claimed`);

                return { status: 'skipped' };
            }

            throw error;
        }

        const { job, recipe, token, incrementalStates } = claimed;

        this.log.info(`Picked up ${message.jobRid} (attempt ${message.attempt})`, {
            build:     job.buildRid,
            recipe:    recipe.rid,
            runtime:   recipe.runtimeConfig.type,
            outputs:   Object.keys(job.outputTransactions).length,
        });

        const onLog = (log: Stdio.Event.Log) => this.log.info(log.line, {
            job:    job.rid,
            stream: log.stream,
        });

        const runtime = this.containers.start(job, recipe, onLog);

        const renewLease = async () => {
            try {
                const heartbeat = await this.api.heartbeat(message);

                if (heartbeat.action === 'stop') {
                    this.log.info(`Stopping ${job.rid}: its build was canceled`);
                    await this.containers.kill(job);
                }
            }
            catch (error) {
                const reason = error instanceof Error ? error.message : String(error);

                this.log.warning(`Heartbeat for ${job.rid} failed`, { error: reason });
            }
        };

        const heartbeats = setInterval(renewLease, HEARTBEAT_INTERVAL_MS);

        let outcome: Stdio.Payload<Forge.Runtime.Run.Response>;

        try {
            await runtime.waitUntilReady(recipe.runtimeConfig.type);

            outcome = await runtime.request(Forge.Runtime.Run, {
                job,
                recipe,
                token,
                incrementalStates,
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

        try {
            await this.api.finish(message, outcome);
        }
        catch (error) {
            // 409: the job was canceled while it ran (its build canceled, or a failure canceled it).
            if (isAxiosError(error) && error.response?.status === 409) {
                this.log.info(`${job.rid} was canceled while it ran — its outcome is dropped`);

                return { status: 'skipped' };
            }

            throw error;
        }

        this.log.info(`Finished ${job.rid}: ${outcome.status}`);

        return { status: outcome.status };
    }
}
