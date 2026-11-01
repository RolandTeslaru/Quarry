import { Processor } from '@nestjs/bullmq';
import { CodeWorkspace } from '@quarry/shared/domain';
import { JobProcessor } from '@quarry/shared/server/queue';
import { CheckRunner } from './check-runner';
import { config } from './config';

import CI = CodeWorkspace.CI;

/**
 * Takes check runs from `code-workspace.run-check` — as many at once as this machine
 * has check slots (CODE_WORKSPACE_CHECK_SLOTS). The server decides what's scheduled
 * (one at a time per workspace); here they're only run.
 */
@Processor(CI.Queue.RunCheck.Definition.name, { concurrency: config.checks.slots })
export class RunCheckProcessor extends JobProcessor<typeof CI.Queue.RunCheck.Definition> {

    protected readonly definition = CI.Queue.RunCheck.Definition;

    constructor(private readonly checkRunner: CheckRunner) {
        super();
    }

    protected async handle(message: CI.Queue.RunCheck.Job): Promise<CI.Queue.RunCheck.Result> {
        return { status: await this.checkRunner.run(message.checkRunRid) };
    }
}
