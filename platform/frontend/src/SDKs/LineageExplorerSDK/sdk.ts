import { createWithEqualityFn } from 'zustand/traditional'
import { immer } from 'zustand/middleware/immer'
import { shallow } from 'zustand/shallow'
import type { ReactFlowInstance } from '@xyflow/react'
import { type Graph, LineageExplorer } from '@quarry/shared/domain'
import { SDK } from '@quarry/standard-ui/SDKs/SDKManager'
import { BaseSDK } from '../core/BaseSDK'
import { LineageExplorerActions } from './actions'
import { _createLineageExplorerDialogs_, type _LineageExplorerSDKDialogs } from './dialogs'
import type { EdgeDriver, NodeDriver } from './ui/Canvas/drivers'

@SDK('LineageExplorer')
export class LineageExplorerSDKImpl extends BaseSDK<LineageExplorerSDK.State> {

    public readonly useStore: BaseSDK.Store<LineageExplorerSDK.State> = createWithEqualityFn(
        immer<LineageExplorerSDK.State>(() => ({
            document: null,
        })),
        shallow,
    )

    // Mutable, not reactive: what the canvas hands over, read in actions.
    public readonly runtime = {
        reactFlow: null as ReactFlowInstance<NodeDriver, EdgeDriver> | null,
    }

    public readonly selectors: LineageExplorerSDK.Selectors = LineageExplorer.Document.selectors

    public readonly reducers: LineageExplorerSDK.Reducers = LineageExplorer.Document.reducers

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

    /** The open exploration's document. Its page renders, and its actions run, only while one is open. */
    public get document(): LineageExplorer.Document {
        const document = this.state.document

        if (!document)
            throw new Error('No exploration is open')

        return document
    }

    public setDocument(recipe: (document: LineageExplorer.Document) => void): void {
        this.setState(state => {
            if (!state.document)
                throw new Error('No exploration is open')

            recipe(state.document)
        })
    }

    // `const`, so a selector returning `[a, b]` is typed as that tuple, not as an array of either.
    public useDocument<const Selected>(selector: (document: LineageExplorer.Document) => Selected): Selected {
        return this.useStore(state => {
            if (!state.document)
                throw new Error('No exploration is open')

            return selector(state.document)
        })
    }

    /** What the canvas has measured, for placing nodes; before it has, every node is at its estimated size. */
    public getNodeSizes(): Graph.Document.Sizes {
        const sizes: Graph.Document.Sizes = {}

        if (!this.runtime.reactFlow)
            return sizes

        for (const node of this.runtime.reactFlow.getNodes()) {
            if (!node.measured?.width || !node.measured.height)
                continue

            sizes[node.id as Graph.Node.Rid] = {
                width:  node.measured.width,
                height: node.measured.height,
            }
        }

        return sizes
    }

    public override cleanup(): void {
        this.setState({
            document: null,
        })
    }
}

export const LineageExplorerSDK = SDK.get<LineageExplorerSDKImpl>('LineageExplorer')

export namespace LineageExplorerSDK {

    export type State = {
        /** The open exploration's page: opened by its route, edited on the canvas until it's saved. */
        document: LineageExplorer.Document | null
    }

    export type Selectors = LineageExplorer.Document.Selectors
    export type Reducers  = LineageExplorer.Document.Reducers
    export type Actions   = LineageExplorerActions
    export type Dialogs   = _LineageExplorerSDKDialogs
}
