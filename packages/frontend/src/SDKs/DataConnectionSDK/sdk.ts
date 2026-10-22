import type { DataConnection } from '@quarry/shared/domain'
import { createWithEqualityFn } from 'zustand/traditional'
import { immer } from 'zustand/middleware/immer'
import { shallow } from 'zustand/shallow'
import { BaseSDK } from '../core/BaseSDK'
import { _createDataConnectionActions_, type _DataConnectionSDKActions } from './actions'

const DEFINITIONS_STALE_TIME = Infinity
const RUNS_REFETCH_INTERVAL = 3_000

export class DataConnectionSDKImpl extends BaseSDK<DataConnectionSDK.State> {

    public readonly useStore: BaseSDK.Store<DataConnectionSDK.State> = createWithEqualityFn(
        immer<DataConnectionSDK.State>(() => ({
            definitions: [],
            sources: {},
            syncs: {},
            runs: {},
            tables: {},
        })),
        shallow,
    )

    public readonly actions: DataConnectionSDK.Actions = _createDataConnectionActions_(this)

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
            refetchInterval: RUNS_REFETCH_INTERVAL,
        }),
    }

    public override cleanup(): void {
        this.setState({
            definitions: [],
            sources: {},
            syncs: {},
            runs: {},
            tables: {},
        })
    }
}

export const DataConnectionSDK = new DataConnectionSDKImpl()

export namespace DataConnectionSDK {

    export type State = {
        definitions: DataConnection.Source.Definition.Schema[]
        sources:     Record<DataConnection.Source.Rid, DataConnection.Source.Schema>
        syncs:       Record<DataConnection.Source.Rid, DataConnection.Sync.Schema[]>
        runs:        Record<DataConnection.Sync.Rid, DataConnection.SyncRun.Schema[]>
        tables:      Record<DataConnection.Source.Rid, DataConnection.Source.Table[]>
    }

    export type Actions = _DataConnectionSDKActions
}
