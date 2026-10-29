import { Injectable, type OnModuleInit } from '@nestjs/common';
import { isAxiosError } from 'axios';
import { CodeWorkspace } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { api } from '@quarry/shared/server/internal-api';
import { DockerDriver, type ExecResult } from './docker-driver';
import { config } from './config';

import CI = CodeWorkspace.CI;
import Internal = CI.API.Internal;
import CheckRun = CodeWorkspace.CI.CheckRun;

/** Labels a check run's container — how a restarted worker finds leftovers. */
const CHECK_LABEL = 'quarry.check-run';

/** Where the checkout is, in the container (quarry-check-setup). */
const REPOSITORY = '/workspace/repo';

/** Clone and venv; `uv sync` is a step of the file's. */
const SETUP_TIMEOUT_MS = 10 * 60_000;

/** What `uses:` runs: stdout is its result (the manifest), stderr its log. */
const USES_COMMANDS: Record<CI.Check.Uses, string> = {
    'quarry/publish-transforms': 'python -m quarry.transforms.manifest',
};

/** The server answered 409: the run was canceled (a newer push) or taken back — stop, quietly. */
class Canceled extends Error {}

/**
 * One check run (docs/design/code-workspaces/checks.md §3), as RunCheckProcessor
 * takes it from the queue: in a throwaway container from the runtime image — clone
 * at the commit, then quarry-ci.yml's steps in order, each reported to the server
 * as it starts and ends.
 */
@Injectable()
export class CheckRunner implements OnModuleInit {

    private readonly log = System.log.withContext('CheckRunner');

    constructor(private readonly dockerDriver: DockerDriver) {}

    /** A restart lost its runs: their containers go; the server's sweep requeues or fails the runs. */
    public async onModuleInit(): Promise<void> {
        for (const container of await this.dockerDriver.list(CHECK_LABEL)) {
            await this.dockerDriver.remove(container.name).catch(() => undefined);
            this.log.info(`Removed a leftover check container: ${container.name}`);
        }
    }

    /** Runs it to the end; `skipped` if it wasn't this worker's to run, or was canceled meanwhile. */
    public async run(rid: CheckRun.Rid): Promise<CI.Queue.RunCheck.Result['status']> {
        let started: Internal.CheckRun.Start.Response;

        try {
            started = await Internal.startCheckRun(api, rid);
        }
        catch (error) {
            if (isConflict(error)) {
                this.log.info(`Skipped ${rid}: not waiting for a worker`);

                return 'skipped';
            }

            throw error;
        }

        const { checkRun, steps, token } = started;
        const container = `quarry-check-${rid.split('.').pop()}`;

        this.log.info(`Running ${rid}: ${checkRun.branch} at ${checkRun.commit.slice(0, 7)}`, { workspace: checkRun.workspaceRid, steps: steps.length });

        try {
            await this.dockerDriver.run({
                name:    container,
                image:   config.sessions.image,
                labels:  { [CHECK_LABEL]: rid, 'quarry.workspace': checkRun.workspaceRid },
                env:     {},
                memory:  config.checks.memory,
                cpus:    config.checks.cpus,
                command: ['sleep', 'infinity'],                             // steps arrive by docker exec
            });

            const setup = await this.dockerDriver.exec(container, ['quarry-check-setup'], {
                env: {
                    QUARRY_TOKEN:   token,
                    QUARRY_GIT_URL: `${config.sessions.serverUrl}/api/git/${checkRun.workspaceRid}.git`,
                    QUARRY_COMMIT:  checkRun.commit,
                },
                timeoutMs: SETUP_TIMEOUT_MS,
            });

            if (setup.code !== 0)
                return await this.finish(rid, { status: 'failed', failure: { step: 'Set up', message: getTail(setup.stderr || setup.stdout) || `exit ${setup.code}` } });


            let manifest: unknown = null;

            for (const [index, step] of steps.entries()) {
                const startedAt = new Date();

                await this.report(rid, index, { status: 'running', startedAt });

                const outcome = await this.runStep(container, step, token);

                await this.report(rid, index, {
                    status:     outcome.ok ? 'succeeded' : 'failed',
                    exitCode:   outcome.exitCode,
                    startedAt,
                    finishedAt: new Date(),
                    log:        outcome.log,
                });

                if (!outcome.ok)
                    return await this.finish(rid, { status: 'failed', failure: { step: step.name, message: outcome.reason } });


                if ('uses' in step)
                    manifest = outcome.result;
            }

            return await this.finish(rid, { status: 'succeeded', manifest });
        }
        catch (error) {
            if (error instanceof Canceled) {
                this.log.info(`Stopped ${rid}: canceled`);

                return 'skipped';
            }

            const message = error instanceof Error ? error.message : String(error);

            await this.finish(rid, { status: 'failed', failure: { step: 'Worker', message } }).catch(() => undefined);
            throw error;
        }
        finally {
            await this.dockerDriver.remove(container).catch(() => undefined);
        }
    }

    /** One step: `run` in sh (stderr merged), `uses` as Quarry's command (stdout its JSON result). */
    private async runStep(container: string, step: CI.Check.Config.Step, token: string): Promise<StepOutcome> {
        const uses = 'uses' in step;
        const script = uses
            ? `. .venv/bin/activate && exec ${USES_COMMANDS[step.uses]}`
            : `. .venv/bin/activate && exec 2>&1\n${step.run}`;

        let result: ExecResult;

        try {
            result = await this.dockerDriver.exec(container, ['sh', '-c', script], {
                env:       { QUARRY_TOKEN: token, QUARRY_SERVER_URL: config.sessions.serverUrl },
                workdir:   REPOSITORY,
                timeoutMs: step.timeoutMinutes * 60_000,
            });
        }
        catch (error) {
            const reason = (error as { killed?: boolean }).killed
                ? `Timed out after ${step.timeoutMinutes} min`
                : `Couldn't run: ${error instanceof Error ? error.message : String(error)}`;

            return { ok: false, exitCode: null, log: '', reason, result: null };
        }

        const log = uses ? result.stderr : result.stdout;

        if (result.code !== 0)
            return { ok: false, exitCode: result.code, log, reason: `Exited with ${result.code}`, result: null };

        if (!uses)
            return { ok: true, exitCode: 0, log, reason: '', result: null };

        try {
            return { ok: true, exitCode: 0, log, reason: '', result: JSON.parse(result.stdout) };
        }
        catch {
            return { ok: false, exitCode: 0, log: `${log}\n${result.stdout}`, reason: "Didn't print a manifest (JSON on stdout)", result: null };
        }
    }

    private async report(rid: CheckRun.Rid, index: number, step: Internal.CheckRun.Step.Input): Promise<void> {
        await this.toServer(() => Internal.reportCheckStep(api, rid, index, step));
    }

    private async finish(rid: CheckRun.Rid, outcome: Internal.CheckRun.Finish.Input): Promise<'succeeded' | 'failed'> {
        await this.toServer(() => Internal.finishCheckRun(api, rid, outcome));
        if (outcome.status === 'failed')
            this.log.info(`Finished ${rid}: failed`, { failure: outcome.failure });
        else
            this.log.info(`Finished ${rid}: succeeded`);

        return outcome.status;
    }

    private async toServer(request: () => Promise<unknown>): Promise<void> {
        try {
            await request();
        }
        catch (error) {
            if (isConflict(error))
                throw new Canceled();

            throw error;
        }
    }
}

interface StepOutcome {
    readonly ok:       boolean;
    readonly exitCode: number | null;
    readonly log:      string;
    /** Why it failed — the run's failure message. */
    readonly reason:   string;
    /** A `uses` step's parsed stdout. */
    readonly result:   unknown;
}

function isConflict(error: unknown): boolean {
    return isAxiosError(error) && error.response?.status === 409;
}

/** The last lines of setup's output — enough to say why. */
function getTail(output: string): string {
    return output.trim().split('\n').slice(-20).join('\n');
}
