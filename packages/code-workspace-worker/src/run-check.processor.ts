import { Processor } from '@nestjs/bullmq';
import { CodeWorkspace } from '@quarry/shared/domain';
import { JobProcessor } from '@quarry/shared/server/queue';
import { CheckRunner } from './check-runner';
import { config } from './config';

/**
 * Takes check runs from `code-workspace.run-check` — as many at once as this machine
 * has check slots (CODE_WORKSPACE_CHECK_SLOTS). The server's dispatch decides what's
 * queued (one running per workspace); here they're only run.
 */
@Processor(CodeWorkspace.Queue.RunCheck.Definition.name, { concurrency: config.checks.slots })
export class RunCheckProcessor extends JobProcessor<typeof CodeWorkspace.Queue.RunCheck.Definition> {

    protected readonly definition = CodeWorkspace.Queue.RunCheck.Definition;

    constructor(private readonly checkRunner: CheckRunner) {
        super();
    }

    protected async handle(message: CodeWorkspace.Queue.RunCheck.Job): Promise<CodeWorkspace.Queue.RunCheck.Result> {
        return { status: await this.checkRunner.run(message.checkRunRid) };
    }
}
