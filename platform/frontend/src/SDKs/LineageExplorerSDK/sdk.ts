import type { Library, LineageExplorer } from '@quarry/shared/domain'
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
            explorations: {},
            graphs: {},
        })),
        shallow,
    )

    public readonly actions: LineageExplorerSDK.Actions = new LineageExplorerActions(this)

    public readonly dialogs: LineageExplorerSDK.Dialogs = _createLineageExplorerDialogs_()

    public override readonly query = {
        /** Every exploration the user can see — the home's; cache only. */
        explorations: {
            queryKey: ['lineage-explorer', 'explorations'] as const,
            queryFn: () => this.actions.exploration.list(),
            staleTime: 0,
        },
    }

    public override cleanup(): void {
        this.setState({
            explorations: {},
            graphs: {},
        })
    }
}

export const LineageExplorerSDK = SDK.get<LineageExplorerSDKImpl>('LineageExplorer')

export namespace LineageExplorerSDK {

    export type State = {
        explorations: Record<LineageExplorer.Exploration.Rid, LineageExplorer.Exploration>
        /** Each exploration's graph, as it was read when it was opened. */
        graphs:       Record<LineageExplorer.Exploration.Rid, Library.Lineage.Graph>
    }

    export type Actions = LineageExplorerActions
    export type Dialogs = _LineageExplorerSDKDialogs
}
