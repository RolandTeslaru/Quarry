import { Processor } from '@nestjs/bullmq';
import { CodeWorkspace } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import { api } from '@quarry/shared/server/internal-api';
import { JobProcessor } from '@quarry/shared/server/queue';

/** Code Workspaces' check sweep: the server sends again, fails the silent, and dispatches. */
@Processor(CodeWorkspace.Queue.CheckSweep.Definition.name, { concurrency: 1 })
export class CodeWorkspaceCheckSweepProcessor extends JobProcessor<typeof CodeWorkspace.Queue.CheckSweep.Definition> {

    protected readonly definition = CodeWorkspace.Queue.CheckSweep.Definition;

    private readonly log = System.log.withContext('CodeWorkspaceCheckSweep');

    protected async handle(): Promise<CodeWorkspace.Queue.CheckSweep.Result> {
        const result = await CodeWorkspace.API.Internal.sweepCheckRuns(api);

        if (result.resent + result.failed + result.dispatched > 0)
            this.log.info(`Check runs: ${result.dispatched} dispatched, ${result.resent} sent again, ${result.failed} failed`);

        return result;
    }
}
