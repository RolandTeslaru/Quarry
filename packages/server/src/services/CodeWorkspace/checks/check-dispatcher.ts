import { ConflictException, Injectable } from '@nestjs/common';
import { CodeWorkspace } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { Principal } from '@/auth/principal';
import { QueueManager } from '@/infra/queue';
import { GitRepositories } from '../git/repositories';
import { CodeWorkspaceRepository } from '../repository/code-workspace.repository';
import { getParseFailedSteps, layOutSteps, readCheckConfig } from './check-config';

const DISPATCH = Principal.SELF('code-workspace.check-dispatch');

/**
 * Sends queued check runs to the workers (docs/design/code-workspaces/checks.md §3):
 * claims the oldest queued run of each workspace with none running (the unique
 * index decides a race), then enqueues it — `code-workspace.run-check`, which the
 * code workspace workers take as they have slots. A run whose quarry-ci.yml is
 * missing or invalid fails here, never enqueued. The check_run table is the outbox:
 * a claimed run whose message Redis lost is sent again by the sweep, under the same job id.
 * Calls arriving while one runs coalesce into one more pass.
 */
@Injectable()
export class CheckDispatcher {

    private readonly log = System.log.withContext('CodeWorkspace.CheckDispatch');

    private current: Promise<number> | null = null;

    private again = false;

    constructor(
        private readonly repository:   CodeWorkspaceRepository,
        private readonly repositories: GitRepositories,
        private readonly queues:       QueueManager,
    ) {}

    /** Fire and forget — a push, a finished run. The sweep catches anything this misses. */
    public trigger(): void {
        this.dispatch().catch(error => this.log.error('Dispatching check runs failed', { error }));
    }

    /** Sends what it can; resolves with how many runs this pass (and any it absorbed) sent. */
    public async dispatch(): Promise<number> {
        if (this.current) {
            this.again = true;

            return this.current;
        }

        this.current = (async () => {
            let sent = 0;

            try {
                do {
                    this.again = false;
                    sent += await this.dispatchOnce();
                } while (this.again);
            }
            finally {
                this.current = null;
            }

            return sent;
        })();

        return this.current;
    }

    private async dispatchOnce(): Promise<number> {
        const skipped = new Set<CodeWorkspace.Rid>();
        let sent = 0;

        for (;;) {
            const next = await this.repository.checkRun.getNextQueued(DISPATCH, [...skipped]);

            if (!next)
                return sent;

            const result = await readCheckConfig(this.repositories, next);

            if ('error' in result) {
                await this.repository.checkRun.failUnclaimed(DISPATCH, next.rid, getParseFailedSteps(result.error), {
                    step:    CodeWorkspace.CheckRun.PARSE_STEP,
                    message: result.error,
                });
                this.log.info(`${next.rid} failed at Parse`, { workspace: next.workspaceRid });
                continue;
            }

            let claimed: CodeWorkspace.CheckRun.Schema | null;

            try {
                claimed = await this.repository.checkRun.claim(DISPATCH, next.rid, layOutSteps(result.config));
            }
            catch (error) {
                if (!(error instanceof ConflictException))
                    throw error;

                skipped.add(next.workspaceRid);                         // another dispatcher started one of its runs
                continue;
            }

            if (!claimed)
                continue;                                               // superseded meanwhile

            try {
                await this.send(claimed);
            }
            catch (error) {
                await this.repository.checkRun.release(DISPATCH, claimed.rid);
                this.log.warning(`Couldn't enqueue ${claimed.rid}; it waits for the next dispatch`, {
                    reason: error instanceof Error ? error.message : String(error),
                });

                return sent;                                            // Redis is down: so is every other send
            }

            this.log.info(`Sent ${claimed.rid}: ${claimed.branch} at ${claimed.commit.slice(0, 7)}`, { workspace: claimed.workspaceRid });
            sent++;
        }
    }

    /** Enqueues a claimed run. Sending it again is ignored while its message is still there. */
    public async send(run: Pick<CodeWorkspace.CheckRun.Schema, 'rid'>): Promise<void> {
        const definition = CodeWorkspace.Queue.RunCheck.Definition;

        await this.queues.add(definition, { checkRunRid: run.rid }, { jobId: CodeWorkspace.Queue.RunCheck.getJobId(run) });
    }
}
