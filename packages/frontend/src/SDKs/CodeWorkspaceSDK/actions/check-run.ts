import { CodeWorkspace } from '@quarry/shared/domain'
import { api } from '@/SDKs/api'
import { RealtimeSDK } from '@/SDKs/RealtimeSDK/sdk'
import { AsyncEventQueueHandler } from '@/SDKs/RealtimeSDK/EventQueue'
import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import type { CodeWorkspaceSDKImpl } from '../sdk'

/** Runs fetched per page — the Checks tab's first screen, and each "Load older". */
const PAGE_SIZE = 25

/** `CodeWorkspaceSDK.actions.checkRun` */
export class CheckRunActions extends ActionGroup<CodeWorkspaceSDKImpl> {

    protected readonly log = log.withContext('CodeWorkspace.Actions.CheckRun')

    /** The newest page — replaces the workspace's history (a refetch starts over). */
    public async list(rid: CodeWorkspace.Rid): Promise<CodeWorkspace.API.ListCheckRuns.Response> {
        const data = await CodeWorkspace.API.listCheckRuns(api, rid, { limit: PAGE_SIZE })

        this.sdk.setState(state => {
            for (const run of data.checkRuns)
                state.checkRuns[run.rid] = run

            state.checkRunHistory[rid] = { rids: data.checkRuns.map(run => run.rid), nextBefore: data.nextBefore }
        })

        return data
    }

    /** The next page, older than what's loaded — appended. Nothing if there's none. */
    public async loadOlder(rid: CodeWorkspace.Rid): Promise<void> {
        const before = this.sdk.state.checkRunHistory[rid]?.nextBefore

        if (!before)
            return

        const data = await CodeWorkspace.API.listCheckRuns(api, rid, { limit: PAGE_SIZE, before })

        this.sdk.setState(state => {
            const history = state.checkRunHistory[rid]

            // A refetch replaced the history meanwhile: this page belongs to the old one.
            if (!history || history.nextBefore !== before)
                return

            for (const run of data.checkRuns)
                state.checkRuns[run.rid] = run

            history.rids.push(...data.checkRuns.map(run => run.rid))
            history.nextBefore = data.nextBefore
        })
    }

    /** Keeps the workspace's runs live (queued, scheduled, each step, finished) until the returned function is called. */
    public follow(rid: CodeWorkspace.Rid): () => void {
        // Events apply in arrival order, through the same queue an async handler would need.
        const events = new AsyncEventQueueHandler<CodeWorkspace.Event.CheckRunUpdated>(event => {
            const run = event.checkRun

            this.sdk.setState(state => {
                const history = state.checkRunHistory[rid]
                const known = run.rid in state.checkRuns

                state.checkRuns[run.rid] = run

                if (!history || known)
                    return

                // A run newer than the newest loaded is new: the top of the history. An older one
                // belongs to a page not loaded yet — it'll come with that page.
                const newest = history.rids[0] ? state.checkRuns[history.rids[0]] : undefined

                if (!newest || run.createdAt >= newest.createdAt)
                    history.rids.unshift(run.rid)
            })
        })

        const unsubscribe = RealtimeSDK.subscribeToChannel(
            CodeWorkspace.Event.getChannel(rid),
            CodeWorkspace.Event.CheckRunUpdated.Schema,
            event => events.add(event),
        )

        return () => {
            unsubscribe()
            events.clear()
        }
    }
}
