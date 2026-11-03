import type { LineageExplorer } from '@quarry/shared/domain'
import { createWithEqualityFn } from 'zustand/traditional'
import { immer } from 'zustand/middleware/immer'
import { shallow } from 'zustand/shallow'
import { BaseSDK } from '../core/BaseSDK'
import { LineageExplorerActions } from './actions'
import { _createLineageExplorerDialogs_, type _LineageExplorerSDKDialogs } from './dialogs'
import { SDK } from '@quarry/standard-ui/SDKs/SDKManager'

@SDK('LineageExplorer')
export class LineageExplorerSDKImpl extends BaseSDK<LineageExplorerSDK.State> {

    public readonly useStore: BaseSDK.Store<LineageExplorerSDK.State> = createWithEqualityFn(
        immer<LineageExplorerSDK.State>(() => ({
            currentGraph: null,
        })),
        shallow,
    )

    public readonly actions: LineageExplorerSDK.Actions = new LineageExplorerActions(this)

    public readonly dialogs: LineageExplorerSDK.Dialogs = _createLineageExplorerDialogs_()

    public override readonly query = {
        /** Every exploration the user can see, as metas — the home's; cache only. */
        listExplorations: {
            queryKey: ['lineage-explorer', 'listExplorations'] as const,
            queryFn: () => this.actions.exploration.list(),
            staleTime: 0,
        },
    }

    public override cleanup(): void {
        this.setState({
            currentGraph: null,
        })
    }
}

export const LineageExplorerSDK = SDK.get<LineageExplorerSDKImpl>('LineageExplorer')

export namespace LineageExplorerSDK {

    export type State = {
        /** The open exploration's page: loaded once by its route, the canvas's starting point. */
        currentGraph: LineageExplorer.Graph | null
    }

    export type Actions = LineageExplorerActions
    export type Dialogs = _LineageExplorerSDKDialogs
}
