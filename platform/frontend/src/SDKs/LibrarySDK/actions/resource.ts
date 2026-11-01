import { Library, type Platform } from '@quarry/shared/domain'
import { api } from '@/SDKs/api'
import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
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
