import { DataConnection } from '@quarry/shared/domain'
import { api } from '@/SDKs/api'
import { LibrarySDK } from '@/SDKs/LibrarySDK/sdk'
import type { DataConnectionSDKImpl } from '../sdk'

export type SourceActions = {
    definitions: () => Promise<DataConnection.API.Source.ListDefinitions.Response>
    get:         (rid: DataConnection.Source.Rid) => Promise<DataConnection.API.Source.Get.Response>
    create:      (request: DataConnection.API.Source.Create.Request) => Promise<DataConnection.Source.Schema>
    test:        (rid: DataConnection.Source.Rid) => Promise<DataConnection.API.Source.Test.Response>
    explore:     (rid: DataConnection.Source.Rid) => Promise<DataConnection.API.Source.Explore.Response>
}

export function createSourceActions(sdk: DataConnectionSDKImpl): SourceActions {
    const setState = sdk.useStore.setState

    return {
        definitions: async () => {
            const data = await DataConnection.API.Source.listDefinitions(api)

            setState({ definitions: data.definitions })

            return data
        },

        get: async rid => {
            const data = await DataConnection.API.Source.get(api, rid)

            setState(state => {
                state.sources[rid] = data.source
            })

            return data
        },

        create: async request => {
            const { source } = await DataConnection.API.Source.create(api, request)

            await LibrarySDK.invalidate(LibrarySDK.query.children(request.parentRid))

            return source
        },

        test: rid =>
            DataConnection.API.Source.test(api, rid),

        explore: async rid => {
            const data = await DataConnection.API.Source.explore(api, rid)

            setState(state => {
                state.tables[rid] = data.tables
            })

            return data
        },
    }
}
