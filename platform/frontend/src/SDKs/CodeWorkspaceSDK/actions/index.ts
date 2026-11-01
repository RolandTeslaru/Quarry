import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import type { CodeWorkspaceSDKImpl } from '../sdk'
import { CheckRunActions } from './check-run'
import { SessionActions } from './session'
import { WorkbenchActions } from './workbench'
import { WorkspaceActions } from './workspace'

/** `CodeWorkspaceSDK.actions`: its groups, by what they act on. */
export class CodeWorkspaceActions extends ActionGroup<CodeWorkspaceSDKImpl> {

    protected readonly log = log.withContext('CodeWorkspace.Actions')

    public readonly workspace = new WorkspaceActions(this.sdk)

    public readonly session = new SessionActions(this.sdk)

    public readonly checkRun = new CheckRunActions(this.sdk)

    public readonly workbench = new WorkbenchActions(this.sdk)
}
