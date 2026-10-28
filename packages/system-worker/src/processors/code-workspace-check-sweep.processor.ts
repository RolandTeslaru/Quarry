import { Processor } from '@nestjs/bullmq';
import { CodeWorkspace } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { api } from '@quarry/shared/server/internal-api';
import { JobProcessor } from '@quarry/shared/server/queue';

/** Code Workspaces' check sweep: the server fails runs whose worker went silent, and schedules what's waiting. */
@Processor(CodeWorkspace.Queue.CheckSweep.Definition.name, { concurrency: 1 })
export class CodeWorkspaceCheckSweepProcessor extends JobProcessor<typeof CodeWorkspace.Queue.CheckSweep.Definition> {

    protected readonly definition = CodeWorkspace.Queue.CheckSweep.Definition;

    private readonly log = System.log.withContext('CodeWorkspaceCheckSweep');

    protected async handle(): Promise<CodeWorkspace.Queue.CheckSweep.Result> {
        const result = await CodeWorkspace.API.Internal.sweepCheckRuns(api);

        if (result.failed + result.scheduled > 0)
            this.log.info(`Check runs: ${result.scheduled} scheduled, ${result.failed} failed`);

        return result;
    }
}
