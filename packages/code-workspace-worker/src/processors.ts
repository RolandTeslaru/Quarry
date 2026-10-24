import { Processor } from '@nestjs/bullmq';
import { CodeWorkspace } from '@quarry/shared/domain';
import { JobProcessor } from '@quarry/shared/server/queue';
import { SessionManager } from './session-manager';

/**
 * Session requests from the server (request–reply over code-workspace.session), made
 * after its permission checks: open a session, list its transforms, preview one.
 */
@Processor(CodeWorkspace.Queue.Session.Definition.name, { concurrency: 8 })
export class SessionProcessor extends JobProcessor<typeof CodeWorkspace.Queue.Session.Definition> {

    protected readonly definition = CodeWorkspace.Queue.Session.Definition;

    constructor(private readonly sessionManager: SessionManager) {
        super();
    }

    protected async handle(job: CodeWorkspace.Queue.Session.Job): Promise<CodeWorkspace.Queue.Session.Result> {
        switch (job.op) {
            case 'open':
                return { op: 'open', url: await this.sessionManager.open(job.workspaceRid, job.userRid) };

            case 'transforms':
                return { op: 'transforms', result: await this.sessionManager.getTransforms(job.workspaceRid, job.userRid) };

            case 'preview':
                return { op: 'preview', result: await this.sessionManager.preview(job.workspaceRid, job.userRid, job.transform, job.rows) };
        }
    }
}
