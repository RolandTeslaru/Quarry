import { Processor } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { Audit } from '@quarry/shared/domain';
import { api } from '@quarry/shared/server/internal-api';
import { JobProcessor } from '@quarry/shared/server/queue';

/** Audit records from every server's outbox, handed to the main server to store (and ack) — stored once, however often delivered. */
@Processor(Audit.Queue.Record.Definition.name, { concurrency: 4 })
export class AuditRecordProcessor extends JobProcessor<typeof Audit.Queue.Record.Definition> {

    protected readonly definition = Audit.Queue.Record.Definition;

    protected async handle(record: Audit.Queue.Record.Job, raw: Job): Promise<Record<string, never>> {
        await Audit.API.Internal.storeRecord(api, { jobId: String(raw.id), record });

        return {};
    }
}
