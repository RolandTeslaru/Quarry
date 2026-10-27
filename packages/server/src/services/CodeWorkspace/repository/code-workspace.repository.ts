import { Injectable } from '@nestjs/common';
import { Repository } from '@/db/repository';
import { CodeWorkspaceDB } from '../code-workspace.db';
import { CheckRunRepository } from './check-run.repository';
import { WorkspaceRepository } from './workspace.repository';

/**
 * The `code_workspace` schema. A write that spans workspaces and check runs
 * would be a method here, so it is one transaction — none does yet. `workspace`
 * and `checkRun` expose only what is safe on its own: every method today, each
 * a complete state change (or a read); a new one stays hidden until listed.
 */
@Injectable()
export class CodeWorkspaceRepository extends Repository(CodeWorkspaceDB.database) {

    public readonly workspace: Pick<WorkspaceRepository, 'create' | 'get' | 'open' | 'list'>;
    public readonly checkRun:  Pick<CheckRunRepository, 'queue' | 'list'>;

    constructor(
        _workspace: WorkspaceRepository,
        _checkRun:  CheckRunRepository,
    ) {
        super();

        this.workspace = _workspace;
        this.checkRun = _checkRun;
    }
}
