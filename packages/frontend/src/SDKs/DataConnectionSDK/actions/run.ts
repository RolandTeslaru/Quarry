import { DataConnection } from '@quarry/shared/domain'
import { api } from '@/SDKs/api'
import { RealtimeSDK } from '@/SDKs/RealtimeSDK/sdk'
import { AsyncEventQueueHandler } from '@/SDKs/RealtimeSDK/EventQueue'
import { ActionGroup } from '@/SDKs/core/actions'
import { log } from '@/SDKs/core/log'
import type { DataConnectionSDKImpl } from '../sdk'

/** `DataConnectionSDK.actions.run` */
export class RunActions extends ActionGroup<DataConnectionSDKImpl> {

    protected readonly log = log.withContext('DataConnection.Actions.Run')

    async list(sourceRid: DataConnection.Source.Rid, syncRid: DataConnection.Sync.Rid): Promise<DataConnection.API.Sync.ListRuns.Response> {
        const data = await DataConnection.API.Sync.listRuns(api, sourceRid, syncRid)

        this.sdk.setState(state => {
            state.runs[syncRid] = data.runs
        })

        return data
    }

    /** Keeps the source's runs live (started, finished, failed) until the returned function is called. */
    follow(sourceRid: DataConnection.Source.Rid): () => void {
        // Events apply in arrival order, through the same queue an async handler would need.
        const events = new AsyncEventQueueHandler<DataConnection.Event.RunUpdated>(event => {
            const run = event.run

            this.sdk.setState(state => {
                const runs = state.runs[run.syncRid] ?? []
                const index = runs.findIndex(existing => existing.rid === run.rid)

                // The newest run first, as the API lists them.
                if (index === -1)
                    state.runs[run.syncRid] = [run, ...runs]
                else
                    runs[index] = run
            })
        })

        const unsubscribe = RealtimeSDK.subscribeToChannel<DataConnection.Event.RunUpdated>(
            DataConnection.Event.getChannel(sourceRid),
            event => events.add(event),
        )

        return () => {
            unsubscribe()
            events.clear()
        }
    }
}
