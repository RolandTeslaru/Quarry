import { DataConnection } from '@quarry/shared/domain'
import { api } from '@/SDKs/api'
import { LibrarySDK } from '@/SDKs/LibrarySDK/sdk'
import type { DataConnectionSDKImpl } from '../sdk'

export type SyncActions = {
    list: (sourceRid: DataConnection.Source.Rid) => Promise<DataConnection.API.Sync.List.Response>
    create: (
        sourceRid: DataConnection.Source.Rid,
        request: DataConnection.API.Sync.Create.Request,
    ) => Promise<DataConnection.Sync.Schema>
    run: (sourceRid: DataConnection.Source.Rid, syncRid: DataConnection.Sync.Rid) => Promise<void>
}

export function createSyncActions(sdk: DataConnectionSDKImpl): SyncActions {
    const setState = sdk.useStore.setState

    return {
        list: async sourceRid => {
            const data = await DataConnection.API.Sync.list(api, sourceRid)

            setState(state => {
                state.syncs[sourceRid] = data.syncs
            })

            return data
        },

        create: async (sourceRid, request) => {
            const { sync } = await DataConnection.API.Sync.create(api, sourceRid, request)

            await Promise.all([
                sdk.invalidate(sdk.query.syncs(sourceRid)),
                LibrarySDK.invalidate(LibrarySDK.query.children(request.output.parentRid)),
            ])

            return sync
        },

        run: async (sourceRid, syncRid) => {
            await DataConnection.API.Sync.run(api, sourceRid, syncRid)

            await sdk.invalidate(sdk.query.runs(sourceRid, syncRid))
        },
    }
}
