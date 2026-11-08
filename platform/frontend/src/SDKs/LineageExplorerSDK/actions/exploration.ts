import { LineageExplorer, type Platform } from '@quarry/shared/domain'
import { NotificationSDK } from '@quarry/standard-ui/SDKs/NotificationSDK'
import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import { api, describeError, errorMessage } from '@/SDKs/api'
import { AuditSDK } from '@/SDKs/AuditSDK/sdk'
import type { LineageExplorerSDKImpl } from '../sdk'

/** `LineageExplorerSDK.actions.exploration` */
export class ExplorationActions extends ActionGroup<LineageExplorerSDKImpl> {

    protected readonly log = log.withContext('LineageExplorer.Actions.Exploration')

    /** The exploration's page opening — its route's loader, on enter. One request: its graph, the open recorded (audit). */
    public async open(rid: LineageExplorer.Exploration.Rid, application: Platform.Application.Id): Promise<LineageExplorer.API.Exploration.Open.Response> {
        const response = await LineageExplorer.API.Exploration.open(api, rid, { application })

        this.sdk.setState(state => {
            state.document = LineageExplorer.Document.create(response.exploration, response.graph)
        })

        // Opening isn't a step: nothing to undo yet.
        this.sdk.history.getState().clear()

        void AuditSDK.invalidate(AuditSDK.query.recents(application))

        return response
    }

    /** Its page closed (the route's onLeave) — only if it's still the open one. */
    public close(rid: LineageExplorer.Exploration.Rid): void {
        // Switching explorations can enter the new one before leaving the old: never close the newer.
        if (this.sdk.state.document?.exploration.rid !== rid)
            return

        this.sdk.setState(state => {
            state.document = null
        })

        this.sdk.history.getState().clear()
    }

    public list(): Promise<LineageExplorer.API.Exploration.List.Response> {
        return LineageExplorer.API.Exploration.list(api)
    }

    public async create(request: LineageExplorer.API.Exploration.Create.Request): Promise<LineageExplorer.Exploration> {
        try {
            const { exploration } = await LineageExplorer.API.Exploration.create(api, request)

            void this.sdk.invalidate(this.sdk.query.listExplorations)

            return exploration
        } catch (error) {
            this.log.error('create failed', describeError(error))
            NotificationSDK.toast.error("Couldn't create the exploration", { description: errorMessage(error) })

            throw error
        }
    }

    /** Saves the open exploration's canvas. */
    public async save(): Promise<LineageExplorer.Exploration> {
        const document = this.sdk.document
        const nodes = this.sdk.selectors.exploration.getSavedNodes(document)

        try {
            const { exploration } = await LineageExplorer.API.Exploration.save(api, document.exploration.rid, {
                nodes,
                legend:   document.legend,
                edgeType: document.edgeType,
            })

            this.sdk.setDocument(d => {
                d.reducers.exploration.markSaved(d, exploration)
            })

            return exploration
        } catch (error) {
            this.log.error('save failed', describeError(error))
            NotificationSDK.toast.error("Couldn't save the exploration", { description: errorMessage(error) })

            throw error
        }
    }
}
