import { Library, type Platform } from '@quarry/shared/domain'
import { api, describeError, errorMessage } from '@/SDKs/api'
import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import { NotificationSDK } from '@quarry/standard-ui/SDKs/NotificationSDK'
import { AuditSDK } from '@/SDKs/AuditSDK/sdk'
import type { LibrarySDKImpl } from '../sdk'

/** `LibrarySDK.actions.resource` */
export class ResourceActions extends ActionGroup<LibrarySDKImpl> {

    protected readonly log = log.withContext('Library.Actions.Resource')

    /**
     * A project's or folder's page opening in an app — its route's loader, on
     * enter. One request: the resource, the open recorded (audit).
     */
    public async open(rid: Library.Resource.Rid, application: Platform.Application.Id): Promise<Library.API.Resource.Open.Response> {
        const data = await Library.API.Resource.open(api, rid, { application })

        this.sdk.setState(state => {
            state.resources[rid] = data.resource
        })

        void AuditSDK.invalidate(AuditSDK.query.recents(application))

        return data
    }

    /** Under another project or folder. The server refuses a cycle, or a parent the user can't write to. */
    public async move(resource: Library.Resource.Base, parentRid: Library.Resource.Rid): Promise<void> {
        try {
            await Library.API.Resource.move(api, resource.rid, { parentRid })

            this.sdk.setState(state => {
                state.resources[resource.rid].parentRid = parentRid
            })

            // Both folders' contents change, and every path through the resource.
            void this.sdk.invalidate(this.sdk.query.children(parentRid))
            void this.sdk.invalidate({ queryKey: ['library', 'path'] })

            if (resource.parentRid)
                void this.sdk.invalidate(this.sdk.query.children(resource.parentRid))

            NotificationSDK.toast.success(`Moved ${resource.name}`)
        } catch (error) {
            this.log.error('move failed', describeError(error))
            NotificationSDK.toast.error(`Couldn't move ${resource.name}`, { description: errorMessage(error) })

            throw error
        }
    }

    /** The server refuses a name a sibling already has, or a resource the user can't write to; the caller shows why. */
    public async rename(resource: Library.Resource.Base, request: Library.API.Resource.Rename.Request): Promise<void> {
        await Library.API.Resource.rename(api, resource.rid, request)

        this.sdk.setState(state => {
            state.resources[resource.rid].name = request.name
        })

        // Lists sort by name, and paths, lineage reads and recents carry it.
        if (resource.parentRid)
            void this.sdk.invalidate(this.sdk.query.children(resource.parentRid))
        else
            void this.sdk.invalidate(this.sdk.query.projects)

        void this.sdk.invalidate({ queryKey: ['library', 'path'] })
        void this.sdk.invalidate({ queryKey: ['library', 'lineage'] })
        void AuditSDK.invalidate({ queryKey: ['audit', 'recents'] })
    }

    /** With everything under it: out of every list, path and lineage read. Nothing restores it yet. */
    public async trash(resource: Library.Resource.Base): Promise<void> {
        try {
            await Library.API.Resource.trash(api, resource.rid)

            if (resource.parentRid)
                void this.sdk.invalidate(this.sdk.query.children(resource.parentRid))
            else
                void this.sdk.invalidate(this.sdk.query.projects)

            void this.sdk.invalidate({ queryKey: ['library', 'path'] })
            void this.sdk.invalidate({ queryKey: ['library', 'lineage'] })
            void AuditSDK.invalidate({ queryKey: ['audit', 'recents'] })

            NotificationSDK.toast.success(`Moved ${resource.name} to the trash`)
        } catch (error) {
            this.log.error('trash failed', describeError(error))
            NotificationSDK.toast.error(`Couldn't move ${resource.name} to the trash`, { description: errorMessage(error) })

            throw error
        }
    }

    public async getChildren(rid: Library.Resource.Rid): Promise<Library.API.Resource.Children.Response> {
        const data = await Library.API.Resource.children(api, rid)

        this.sdk.setState(state => {
            state.children[rid] = data.children.map(resource => resource.rid)

            for (const resource of data.children)
                state.resources[resource.rid] = resource
        })

        return data
    }

    public async getPath(rid: Library.Resource.Rid): Promise<Library.API.Resource.Path.Response> {
        const data = await Library.API.Resource.path(api, rid)

        this.sdk.setState(state => {
            state.paths[rid] = data.path.map(resource => resource.rid)

            for (const resource of data.path)
                state.resources[resource.rid] = resource
        })

        return data
    }
}
