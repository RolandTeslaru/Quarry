import { CodeWorkspace, type Platform } from '@quarry/shared/domain'
import { NotificationSDK } from '@quarry/standard-ui/SDKs/NotificationSDK'
import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import { api, describeError, errorMessage } from '@/SDKs/api'
import { AuditSDK } from '@/SDKs/AuditSDK/sdk'
import { LibrarySDK } from '@/SDKs/LibrarySDK/sdk'
import type { CodeWorkspaceSDKImpl } from '../sdk'

/** `CodeWorkspaceSDK.actions.workspace` */
export class WorkspaceActions extends ActionGroup<CodeWorkspaceSDKImpl> {

    protected readonly log = log.withContext('CodeWorkspace.Actions.Workspace')

    /** The workspace's page opening in an app — its route's loader, on enter: it, and the open recorded (audit). */
    public async open(rid: CodeWorkspace.Rid, application: Platform.Application.Id): Promise<CodeWorkspace.API.Open.Response> {
        const data = await CodeWorkspace.API.open(api, rid, { application })

        this.sdk.setState(state => {
            state.workspaces[rid] = data.workspace
            state.openWorkspaceRid = rid
        })

        this.sdk.seedQuery(query => query.workspace(rid), { workspace: data.workspace })

        void AuditSDK.invalidate(AuditSDK.query.recents(application))

        return data
    }

    /** This workspace's page closed (the route's onLeave) — only if it's still the open one. */
    public close(rid: CodeWorkspace.Rid): void {
        // Switching workspaces can enter the new one before leaving the old: never close the newer.
        if (this.sdk.state.openWorkspaceRid !== rid)
            return

        this.sdk.setState(state => {
            state.openWorkspaceRid = null
        })
    }

    public async getTemplates(): Promise<CodeWorkspace.API.ListTemplates.Response> {
        const data = await CodeWorkspace.API.listTemplates(api)

        this.sdk.setState({ templates: data.templates })

        return data
    }

    public list(): Promise<CodeWorkspace.API.List.Response> {
        return CodeWorkspace.API.list(api)
    }

    public async get(rid: CodeWorkspace.Rid): Promise<CodeWorkspace.API.Get.Response> {
        const data = await CodeWorkspace.API.get(api, rid)

        this.sdk.setState(state => {
            state.workspaces[rid] = data.workspace
        })

        return data
    }

    public async create(request: CodeWorkspace.API.Create.Request): Promise<CodeWorkspace.Schema> {
        try {
            const { workspace } = await CodeWorkspace.API.create(api, request)

            await LibrarySDK.invalidate(LibrarySDK.query.children(request.parentRid))
            await this.sdk.invalidate(this.sdk.query.workspaces)

            return workspace
        }
        catch (error) {
            this.log.error('create failed', describeError(error))
            NotificationSDK.toast.error("Couldn't create the workspace", { description: errorMessage(error) })

            throw error
        }
    }
}
