import type { DataConnection } from '@quarry/shared/domain'
import { createWithEqualityFn } from 'zustand/traditional'
import { immer } from 'zustand/middleware/immer'
import { shallow } from 'zustand/shallow'
import { BaseSDK } from '../core/BaseSDK'
import { DataConnectionActions } from './actions'
import { _createDataConnectionDialogs_, type _DataConnectionSDKDialogs } from './dialogs'
import { SDK } from '@quarry/standard-ui/SDKs/SDKManager'

const DEFINITIONS_STALE_TIME = Infinity

@SDK('DataConnection')
export class DataConnectionSDKImpl extends BaseSDK<DataConnectionSDK.State> {

    public readonly useStore: BaseSDK.Store<DataConnectionSDK.State> = createWithEqualityFn(
        immer<DataConnectionSDK.State>(() => ({
            definitions: {},
            sources: {},
            syncs: {},
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

        /** A source table's first rows — a live read of the source, so not on window focus. */
        tablePreview: (rid: DataConnection.Source.Rid, table: DataConnection.Source.Table) => ({
            queryKey: ['data-connection', 'table-preview', rid, table.schema, table.name] as const,
            queryFn: () => this.actions.source.previewTable(rid, table),
            staleTime: 0,
            refetchOnWindowFocus: false,
        }),

        syncs: (sourceRid: DataConnection.Source.Rid) => ({
            queryKey: ['data-connection', 'syncs', sourceRid] as const,
            queryFn: () => this.actions.sync.list(sourceRid),
        }),
    }

    public override cleanup(): void {
        this.setState({
            definitions: {},
            sources: {},
            syncs: {},
            tables: {},
            openSourceRid: null,
        })
    }
}

export const DataConnectionSDK = SDK.get<DataConnectionSDKImpl>('DataConnection')

export namespace DataConnectionSDK {

    export type State = {
        definitions: Record<DataConnection.Source.DefinitionId, DataConnection.Source.Definition>
        sources:     Record<DataConnection.Source.Rid, DataConnection.Source>
        /** Each source's syncs, by rid — in the server's order (keys keep insertion order). */
        syncs:       Record<DataConnection.Source.Rid, Record<DataConnection.Sync.Rid, DataConnection.Sync>>
        tables:      Record<DataConnection.Source.Rid, DataConnection.Source.Table[]>
        /** The source whose page is open (the route sets it). */
        openSourceRid: DataConnection.Source.Rid | null
    }

    export type Actions = DataConnectionActions
    export type Dialogs = _DataConnectionSDKDialogs
}
