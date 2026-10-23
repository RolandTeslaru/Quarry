import { DataConnection } from '@quarry/shared/domain'
import { NotificationSDK } from '@quarry/standard-ui/SDKs/NotificationSDK'
import { api, describeError, errorMessage } from '@/SDKs/api'
import { ActionGroup } from '@/SDKs/core/actions'
import { log } from '@/SDKs/core/log'
import { LibrarySDK } from '@/SDKs/LibrarySDK/sdk'
import type { DataConnectionSDKImpl } from '../sdk'

/** `DataConnectionSDK.actions.source` */
export class SourceActions extends ActionGroup<DataConnectionSDKImpl> {

    protected readonly log = log.withContext('DataConnection.Actions.Source')

    /** This source's page is open (the route's onEnter / onStay). */
    public open(rid: DataConnection.Source.Rid): void {
        this.sdk.setState(state => {
            state.openSourceRid = rid
        })
    }

    /** This source's page closed (the route's onLeave) — only if it's still the open one. */
    public close(rid: DataConnection.Source.Rid): void {
        // Switching sources can enter the new one before leaving the old: never close the newer.
        if (this.sdk.state.openSourceRid !== rid)
            return

        this.sdk.setState(state => {
            state.openSourceRid = null
        })
    }

    public async definitions(): Promise<DataConnection.API.Source.ListDefinitions.Response> {
        const data = await DataConnection.API.Source.listDefinitions(api)

        this.sdk.setState({ definitions: data.definitions })

        return data
    }

    public list(): Promise<DataConnection.API.Source.List.Response> {
        return DataConnection.API.Source.list(api)
    }

    public async get(rid: DataConnection.Source.Rid): Promise<DataConnection.API.Source.Get.Response> {
        const data = await DataConnection.API.Source.get(api, rid)

        this.sdk.setState(state => {
            state.sources[rid] = data.source
        })

        return data
    }

    public async create(request: DataConnection.API.Source.Create.Request): Promise<DataConnection.Source.Schema> {
        try {
            const { source } = await DataConnection.API.Source.create(api, request)

            await LibrarySDK.invalidate(LibrarySDK.query.children(request.parentRid))

            return source
        }
        catch (error) {
            this.log.error('create failed', describeError(error))
            NotificationSDK.toast.error("Couldn't create source", { description: errorMessage(error) })

            throw error
        }
    }

    public async test(rid: DataConnection.Source.Rid): Promise<DataConnection.API.Source.Test.Response> {
        try {
            return await DataConnection.API.Source.test(api, rid)
        }
        catch (error) {
            this.log.error('test failed', describeError(error))
            NotificationSDK.toast.error("Couldn't test the connection", { description: errorMessage(error) })

            throw error
        }
    }

    public async explore(rid: DataConnection.Source.Rid): Promise<DataConnection.API.Source.Explore.Response> {
        try {
            const data = await DataConnection.API.Source.explore(api, rid)

            this.sdk.setState(state => {
                state.tables[rid] = data.tables
            })

            return data
        }
        catch (error) {
            this.log.error('explore failed', describeError(error))
            // A query: it reruns (window focus) — one toast per source, replaced, not stacked.
            NotificationSDK.toast.error("Couldn't load the source's tables", { id: `explore-${rid}`, description: errorMessage(error) })

            throw error
        }
    }
}
