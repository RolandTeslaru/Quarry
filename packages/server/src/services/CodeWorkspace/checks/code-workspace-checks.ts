import { Injectable } from '@nestjs/common';
import { CodeWorkspace, type Foundations } from '@quarry/shared/domain';
import { System } from '@quarry/shared/server/system';
import type { Principal } from '@/auth/principal';
import { CodeWorkspaceRepository, type QueuedCheckRuns } from '../code-workspace.repository';
import type { Heads } from '../git/repositories';

/**
 * CI for Code Workspaces (docs/design/code-workspaces/checks.md): a check run
 * per pushed branch head, queued as the pusher. Running them is the worker's
 * (not yet built); here they're queued and superseded.
 */
@Injectable()
export class CodeWorkspaceChecks {

    private readonly log = System.log.withContext('CodeWorkspace.Checks');

    constructor(private readonly repository: CodeWorkspaceRepository) {}

    /** Branches moved by a push (or the template's first commit): a queued run for each new head. */
    public async pushed(principal: Principal.User, rid: CodeWorkspace.Rid, moved: Heads): Promise<QueuedCheckRuns> {
        const runs = await this.repository.queueCheckRuns(principal, rid, moved);

        for (const run of runs.queued)
            this.log.info(`Queued ${run.rid}: ${run.branch} at ${run.commit.slice(0, 7)}`, { workspace: rid });

        if (runs.canceled.length > 0)
            this.log.info(`Superseded ${runs.canceled.length} run(s) of ${rid}`, { canceled: runs.canceled.map(run => run.rid) });

        return runs;
    }

    public async listCheckRuns(principal: Principal, rid: CodeWorkspace.Rid, branch?: Foundations.Branch): Promise<CodeWorkspace.CheckRun.Schema[]> {
        return this.repository.listCheckRuns(principal, rid, branch);
    }
}

/** The branches a push created or moved, at their new heads. Deleted branches aren't in it — they run nothing. */
export function getMovedHeads(before: Heads, after: Heads): Heads {
    return Object.fromEntries(
        Object.entries(after).filter(([branch, commit]) => before[branch as Foundations.Branch] !== commit),
    ) as Heads;
}
