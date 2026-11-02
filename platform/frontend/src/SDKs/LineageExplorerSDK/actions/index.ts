import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import type { LineageExplorerSDKImpl } from '../sdk'
import { ExplorationActions } from './exploration'

/** `LineageExplorerSDK.actions`: its groups, by what they act on. */
export class LineageExplorerActions extends ActionGroup<LineageExplorerSDKImpl> {

    protected readonly log = log.withContext('LineageExplorer.Actions')

    public readonly exploration = new ExplorationActions(this.sdk)
}
