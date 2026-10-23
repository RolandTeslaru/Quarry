import { DataConnection } from '@quarry/shared/domain'
import { NotificationSDK } from '@quarry/standard-ui/SDKs/NotificationSDK'
import { api, describeError, errorMessage } from '@/SDKs/api'
import { ActionGroup } from '@/SDKs/core/actions'
import { log } from '@/SDKs/core/log'
import { LibrarySDK } from '@/SDKs/LibrarySDK/sdk'
import type { DataConnectionSDKImpl } from '../sdk'

/** `DataConnectionSDK.actions.sync` */
export class SyncActions extends ActionGroup<DataConnectionSDKImpl> {

    protected readonly log = log.withContext('DataConnection.Actions.Sync')

    async list(sourceRid: DataConnection.Source.Rid): Promise<DataConnection.API.Sync.List.Response> {
        const data = await DataConnection.API.Sync.list(api, sourceRid)

        this.sdk.setState(state => {
            state.syncs[sourceRid] = data.syncs
        })

        return data
    }

    async create(sourceRid: DataConnection.Source.Rid, request: DataConnection.API.Sync.Create.Request): Promise<DataConnection.Sync.Schema> {
        try {
            const { sync } = await DataConnection.API.Sync.create(api, sourceRid, request)

            await Promise.all([
                this.sdk.invalidate(this.sdk.query.syncs(sourceRid)),
                LibrarySDK.invalidate(LibrarySDK.query.children(request.output.parentRid)),
            ]) 

            return sync
        }
        catch (error) {
            this.log.error('create failed', describeError(error))
            NotificationSDK.toast.error("Couldn't create the sync", { description: errorMessage(error) })

            throw error
        }
    }

    async run(sourceRid: DataConnection.Source.Rid, syncRid: DataConnection.Sync.Rid): Promise<void> {
        try {
            await DataConnection.API.Sync.run(api, sourceRid, syncRid)

            await this.sdk.invalidate(this.sdk.query.runs(sourceRid, syncRid))
        }
        catch (error) {
            this.log.error('run failed', describeError(error))
            NotificationSDK.toast.error("Couldn't start the sync", { description: errorMessage(error) })

            throw error
        }
    }
}
