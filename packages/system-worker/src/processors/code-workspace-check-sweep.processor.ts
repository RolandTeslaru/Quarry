import { Processor } from '@nestjs/bullmq';
import { CodeWorkspace } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { api } from '@quarry/shared/server/internal-api';
import { JobProcessor } from '@quarry/shared/server/queue';

import CI = CodeWorkspace.CI;

/** Code Workspaces' check sweep: the server fails runs whose worker went silent, and schedules what's waiting. */
@Processor(CI.Queue.CheckSweep.Definition.name, { concurrency: 1 })
export class CodeWorkspaceCheckSweepProcessor extends JobProcessor<typeof CI.Queue.CheckSweep.Definition> {

    protected readonly definition = CI.Queue.CheckSweep.Definition;

    private readonly log = System.log.withContext('CodeWorkspaceCheckSweep');

    protected async handle(): Promise<CI.Queue.CheckSweep.Result> {
        const result = await CI.API.Internal.sweepCheckRuns(api);

        if (result.failed + result.scheduled > 0)
            this.log.info(`Check runs: ${result.scheduled} scheduled, ${result.failed} failed`);

        return result;
    }
}
