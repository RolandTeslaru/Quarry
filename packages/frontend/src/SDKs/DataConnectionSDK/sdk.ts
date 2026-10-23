import type { DataConnection } from '@quarry/shared/domain'
import { createWithEqualityFn } from 'zustand/traditional'
import { immer } from 'zustand/middleware/immer'
import { shallow } from 'zustand/shallow'
import { BaseSDK } from '../core/BaseSDK'
import { DataConnectionActions } from './actions'
import { _createDataConnectionDialogs_, type _DataConnectionSDKDialogs } from './dialogs'
import { SDK } from '@quarry/standard-ui/SDKs/SDKManager'
import { observeDataConnection, type DataConnectionObserver, type ObserveOptions as ObserveOptions_ } from './observe'

const DEFINITIONS_STALE_TIME = Infinity

@SDK('DataConnection')
export class DataConnectionSDKImpl extends BaseSDK<DataConnectionSDK.State> {

    constructor() {
        super()

        // While a source is open, its runs stay live: follow its channel from onOpen to onClose.
        this.observe({
            source: {
                onOpen:  sourceRid => {
                    this.runtime.stopFollowing = this.actions.run.follow(sourceRid)
                },
                onClose: () => {
                    this.runtime.stopFollowing?.()
                    this.runtime.stopFollowing = null
                },
            },
        }, { immediate: true })
    }

    public readonly runtime = {
        /** Ends following the open source's runs. */
        stopFollowing: null as (() => void) | null,
    }

    public readonly useStore: BaseSDK.Store<DataConnectionSDK.State> = createWithEqualityFn(
        immer<DataConnectionSDK.State>(() => ({
            definitions: [],
            sources: {},
            syncs: {},
            runs: {},
            tables: {},
            openSourceRid: null,
        })),
        shallow,
    )

    public readonly actions: DataConnectionSDK.Actions = new DataConnectionActions(this)

    public readonly dialogs: DataConnectionSDK.Dialogs = _createDataConnectionDialogs_()

    public override readonly query = {
        definitions: {
            queryKey: ['data-connection', 'definitions'] as const,
            queryFn: () => this.actions.source.definitions(),
            staleTime: DEFINITIONS_STALE_TIME,
        },

        /** Every source the user can see — Data Connection's home; cache only. */
        sources: {
            queryKey: ['data-connection', 'sources'] as const,
            queryFn: () => this.actions.source.list(),
            staleTime: 0,
        },

        source: (rid: DataConnection.Source.Rid) => ({
            queryKey: ['data-connection', 'source', rid] as const,
            queryFn: () => this.actions.source.get(rid),
        }),

        tables: (rid: DataConnection.Source.Rid) => ({
            queryKey: ['data-connection', 'tables', rid] as const,
            queryFn: () => this.actions.source.explore(rid),
        }),

        syncs: (sourceRid: DataConnection.Source.Rid) => ({
            queryKey: ['data-connection', 'syncs', sourceRid] as const,
            queryFn: () => this.actions.sync.list(sourceRid),
        }),

        runs: (sourceRid: DataConnection.Source.Rid, syncRid: DataConnection.Sync.Rid) => ({
            queryKey: ['data-connection', 'runs', sourceRid, syncRid] as const,
            queryFn: () => this.actions.run.list(sourceRid, syncRid),
        }),
    }

    /** Named callbacks for this SDK's transitions (`source.onOpen`, `source.onClose`); returns its own removal. */
    public observe(observer: DataConnectionSDK.Observer, options?: DataConnectionSDK.ObserveOptions): () => void {
        return observeDataConnection(this, observer, options)
    }

    public override cleanup(): void {
        this.setState({
            definitions: [],
            sources: {},
            syncs: {},
            runs: {},
            tables: {},
            openSourceRid: null,
        })
    }
}

export const DataConnectionSDK = SDK.get<DataConnectionSDKImpl>('DataConnection')

export namespace DataConnectionSDK {

    export type State = {
        definitions: DataConnection.Source.Definition.Schema[]
        sources:     Record<DataConnection.Source.Rid, DataConnection.Source.Schema>
        syncs:       Record<DataConnection.Source.Rid, DataConnection.Sync.Schema[]>
        runs:        Record<DataConnection.Sync.Rid, DataConnection.SyncRun.Schema[]>
        tables:      Record<DataConnection.Source.Rid, DataConnection.Source.Table[]>
        /** The source whose page is open (the route sets it); its runs are followed live. */
        openSourceRid: DataConnection.Source.Rid | null
    }

    export type Actions = DataConnectionActions
    export type Dialogs = _DataConnectionSDKDialogs

    export type Observer       = DataConnectionObserver
    export type ObserveOptions = ObserveOptions_
}
