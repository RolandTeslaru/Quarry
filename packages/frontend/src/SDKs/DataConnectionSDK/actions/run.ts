import { DataConnection } from '@quarry/shared/domain'
import { api } from '@/SDKs/api'
import type { DataConnectionSDKImpl } from '../sdk'

export type RunActions = {
    list: (
        sourceRid: DataConnection.Source.Rid,
        syncRid: DataConnection.Sync.Rid,
    ) => Promise<DataConnection.API.Sync.ListRuns.Response>
}

export function createRunActions(sdk: DataConnectionSDKImpl): RunActions {
    const setState = sdk.useStore.setState

    return {
        list: async (sourceRid, syncRid) => {
            const data = await DataConnection.API.Sync.listRuns(api, sourceRid, syncRid)

            setState(state => {
                state.runs[syncRid] = data.runs
            })

            return data
        },
    }
}
