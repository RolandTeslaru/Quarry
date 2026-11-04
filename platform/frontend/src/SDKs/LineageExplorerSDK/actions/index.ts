import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import type { LineageExplorerSDKImpl } from '../sdk'
import { ExplorationActions } from './exploration'
import { GraphActions } from './graph'
import { LegendActions } from './legend'

/** `LineageExplorerSDK.actions`: its groups, by what they act on. */
export class LineageExplorerActions extends ActionGroup<LineageExplorerSDKImpl> {

    protected readonly log = log.withContext('LineageExplorer.Actions')

    public readonly exploration = new ExplorationActions(this.sdk)

    public readonly graph = new GraphActions(this.sdk)

    public readonly legend = new LegendActions(this.sdk)
}
