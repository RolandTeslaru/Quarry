import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import type { LineageExplorerSDKImpl } from '../sdk'

/**
 * `LineageExplorerSDK.actions.history`: undo and redo, a whole document at a time. The exploration as last saved
 * stays, and the canvas is left unsaved: going back never makes it match what was saved.
 * Neither write after the move is a step (see the store's `equality`), so the history stays as it is.
 */
export class HistoryActions extends ActionGroup<LineageExplorerSDKImpl> {

    protected readonly log = log.withContext('LineageExplorer.Actions.History')

    public undo(): void {
        const history = this.sdk.history.getState()
        const exploration = this.sdk.document.exploration

        // ⌘Z with nothing to undo: the canvas is unchanged, so it stays saved.
        if (history.pastStates.length === 0)
            return

        history.undo()

        this.sdk.setDocument(d => {
            d.exploration = exploration
            d.isDirty = true
        })
    }

    public redo(): void {
        const history = this.sdk.history.getState()
        const exploration = this.sdk.document.exploration

        if (history.futureStates.length === 0)
            return

        history.redo()

        this.sdk.setDocument(d => {
            d.exploration = exploration
            d.isDirty = true
        })
    }
}
