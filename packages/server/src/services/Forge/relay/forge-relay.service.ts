import { Injectable } from '@nestjs/common';
import { Forge } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { Principal } from '@/auth/principal';
import { QueueManager } from '@/infra/queue';
import { RealtimeService } from '@/services/Realtime/realtime.service';
import { ForgeRepository } from '../forge.repository';

/**
 * Hands scheduled jobs to the queue (Redis), then marks them queued — the job
 * table is the outbox. Called after the commit that scheduled them, never
 * inside it, and best effort: a job left scheduled is sent again (the sweep,
 * later); a repeated push is ignored (the BullMQ job id is `<rid>_<attempt>`).
 */
@Injectable()
export class ForgeRelayService {

    private readonly log = System.log.withContext('ForgeRelay');

    constructor(
        private readonly queues:     QueueManager,
        private readonly repository: ForgeRepository,
        private readonly realtime:   RealtimeService,
    ) {}

    public async relay(jobs: Pick<Forge.Job.Schema, 'rid' | 'attempt'>[]): Promise<void> {
        for (const job of jobs) {
            const message = { jobRid: job.rid, attempt: job.attempt };

            try {
                // Push first, then mark: a crash in between leaves it scheduled, so it's pushed again.
                await this.queues.add(Forge.Queue.RunJob.Definition, message, { jobId: Forge.Queue.RunJob.getJobId(message) });

                const queued = await this.repository.markQueued(Principal.SELF('forge.relay'), message);

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
