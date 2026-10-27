import { Injectable } from '@nestjs/common';
import { Forge } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { Principal } from '@/auth/principal';
import { QueueManager } from '@/infra/queue';
import { RealtimeService } from '@/services/Realtime/realtime.service';
import { ForgeRepository } from '../repository/forge.repository';

/**
 * Hands scheduled jobs to the queue (Redis), then marks them queued — the job
 * table is the outbox. Two ways: `relay` right after the commit that scheduled
 * them (the fast path, best effort), and `sweep` every minute, triggered by the
 * system worker, for whatever the fast path didn't deliver. A repeated push is
 * ignored: the BullMQ job id is `<rid>_<attempt>`.
 */
@Injectable()
export class ForgeRelayService {

    private readonly log = System.log.withContext('ForgeRelay');

    constructor(
        private readonly queues:     QueueManager,
        private readonly repository: ForgeRepository,
        private readonly realtime:   RealtimeService,
    ) {}

    /**
     * Sends again what the fast path didn't deliver: jobs still scheduled, and
     * jobs queued over `staleQueuedMinutes` ago that no ForgeAgent started — Redis
     * runs without persistence, so a restart loses its messages. Returns how many.
     */
    public async sweep(staleQueuedMinutes: number): Promise<number> {
        const jobs = await this.repository.job.listToRelay(Principal.SELF('forge.relay.sweep'), staleQueuedMinutes);

        if (jobs.length > 0)
            this.log.info(`Sweep: relaying ${jobs.length} job(s)`);

        await this.relay(jobs);

        return jobs.length;
    }

    public async relay(jobs: Pick<Forge.Job.Schema, 'rid' | 'attempt'>[]): Promise<void> {
        for (const job of jobs) {
            const message = { jobRid: job.rid, attempt: job.attempt };

            try {
                // Push first, then mark: a crash in between leaves it scheduled, so it's pushed again.
                await this.queues.add(Forge.Queue.RunJob.Definition, message, { jobId: Forge.Queue.RunJob.getJobId(message) });

                const queued = await this.repository.job.markQueued(Principal.SELF('forge.relay'), message);

                if (queued)
                    this.realtime.emitEvent({
                        ...Forge.Event.create('forge:job:updated', { job: queued }),
                        channel: Forge.Event.getChannel(queued.buildRid),
                    });
            }
            catch (error) {
                this.log.warning('Could not queue a job — it stays scheduled', {
                    jobRid: job.rid,
                    error:  error instanceof Error ? error.message : String(error),
                });
            }
        }
    }
}
