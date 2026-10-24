import { Processor } from '@nestjs/bullmq';
import { DataConnection } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { api } from '@quarry/shared/server/internal-api';
import { JobProcessor } from '@quarry/shared/server/queue';
import { describeParquet, DuckDb, SourceRuntimes } from './infra';

import Internal = DataConnection.API.Internal;

const HEARTBEAT_MS = 30_000;

/**
 * One sync run. The server owns everything in Postgres — it records the run,
 * opens the dataset transaction, checks permissions, registers the files and
 * commits; this process only copies:
 *
 *   server: start run  →  source runtime: open → sync(config) (Parquet to S3) → close
 *   →  describe what was written  →  server: complete (or fail, which aborts)
 *
 * Throws on failure so BullMQ retries; each attempt is a new run.
 */
@Processor(DataConnection.Queue.Sync.Definition.name, { concurrency: 1 })
export class SyncProcessor extends JobProcessor<typeof DataConnection.Queue.Sync.Definition> {

    protected readonly definition = DataConnection.Queue.Sync.Definition;

    private readonly log = System.log.withContext('SyncProcessor');

    constructor(
        private readonly runtimes: SourceRuntimes,
        private readonly duckdb:   DuckDb,
    ) {
        super();
    }

    protected async handle(job: DataConnection.Queue.Sync.Job): Promise<DataConnection.Queue.Sync.Result> {
        const run = await Internal.startRun(api, job);

        if (run.skipped)
            return { syncRunRid: null, transactionRid: null, rowCount: 0, skipped: true };

        const heartbeat = setInterval(() => {
            Internal.heartbeat(api, run.runRid).catch((error: unknown) => {
                this.log.warning('Heartbeat failed', {
                    runRid: run.runRid,
                    error:  error instanceof Error ? error.message : String(error),
                });
            });
        }, HEARTBEAT_MS);

        try {
            const copied = await this.runtimes.sync(run.source, run.credential, run.syncConfig, { destination: run.destination, state: run.state });
            const written = await describeParquet(this.duckdb, run.destination);

            const completed = await Internal.completeRun(api, run.runRid, {
                rowCount:  copied.rowCount,
                state:     copied.state,
                schema:    written.schema,
                rowCounts: written.rowCounts,
            });

            this.log.info('Sync completed', {
                syncRid:    job.syncRid,
                runRid:     run.runRid,
                datasetRid: run.datasetRid,
                rowCount:   copied.rowCount,
                files:      completed.files,
            });

            return { syncRunRid: run.runRid, transactionRid: completed.transactionRid, rowCount: copied.rowCount, skipped: false };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            await Internal.failRun(api, run.runRid, { message }).catch((failError: unknown) => {
                this.log.warning('Could not fail run', {
                    runRid: run.runRid,
                    error:  failError instanceof Error ? failError.message : String(failError),
                });
            });

            throw error;
        }
        finally {
            clearInterval(heartbeat);
        }
    }
}

/**
 * Connection test and table exploration, for the server (request–reply over
 * the probe queue). The server already loaded the source and checked the
 * requester's permissions on it and its credential; the job carries both, the
 * credential still encrypted.
 */
@Processor(DataConnection.Queue.SourceProbe.Definition.name, { concurrency: 4 })
export class SourceProbeProcessor extends JobProcessor<typeof DataConnection.Queue.SourceProbe.Definition> {

    protected readonly definition = DataConnection.Queue.SourceProbe.Definition;

    private readonly log = System.log.withContext('SourceProbe');

    constructor(private readonly runtimes: SourceRuntimes) {
        super();
    }

    protected async handle(job: DataConnection.Queue.SourceProbe.Job): Promise<DataConnection.Queue.SourceProbe.Result> {
        switch (job.op) {
            case 'test':
                try {
                    await this.runtimes.with(job.source, job.credential, async () => undefined);          // open → close: opening is the test

                    this.log.info('Connection test passed', { sourceRid: job.source.rid });

                    return { op: 'test', ok: true, error: null };
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);

                    // A failed test is an answer, not a job failure — so it's logged here.
                    this.log.warning('Connection test failed', { sourceRid: job.source.rid, error: message });

                    return { op: 'test', ok: false, error: message };
                }

            case 'explore':
                return {
                    op:     'explore',
                    tables: await this.runtimes.with(job.source, job.credential, (runtime) => {
                        if (!runtime.explore)
                            throw new Error(`Source type '${job.source.definitionId}' can't be explored`);

                        return runtime.explore();
                    }),
                };

            case 'preview':
                return {
                    op:      'preview',
                    preview: await this.runtimes.with(job.source, job.credential, (runtime) => {
                        if (!runtime.preview)
                            throw new Error(`Source type '${job.source.definitionId}' can't be previewed`);

                        return runtime.preview(job.table, job.limit);
                    }),
                };
        }
    }
}
