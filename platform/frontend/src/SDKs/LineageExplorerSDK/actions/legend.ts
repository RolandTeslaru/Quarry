import type { LineageExplorer } from '@quarry/shared/domain'
import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import type { LineageExplorerSDKImpl } from '../sdk'

/** `LineageExplorerSDK.actions.legend`: what the nodes are coloured by, and whether its key shows. Saved with the exploration. */
export class LegendActions extends ActionGroup<LineageExplorerSDKImpl> {

    protected readonly log = log.withContext('LineageExplorer.Actions.Legend')

    public setType(type: LineageExplorer.Legend.Type): void {
        this.sdk.setDocument(d => {
            d.reducers.legend.setType(d, type)
        })
    }

    public toggle(): void {
        this.sdk.setDocument(d => {
            d.reducers.legend.setVisible(d, !d.legend.isVisible)
        })
    }
}
