import { Library } from '@quarry/shared/domain'
import { api } from '@/SDKs/api'
import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import type { LibrarySDKImpl } from '../sdk'

/** `LibrarySDK.actions.resource` */
export class ResourceActions extends ActionGroup<LibrarySDKImpl> {

    protected readonly log = log.withContext('Library.Actions.Resource')

    public async children(rid: Library.Resource.Rid): Promise<Library.API.Resource.Children.Response> {
        const data = await Library.API.Resource.children(api, rid)

        this.sdk.setState(state => {
            state.children[rid] = data.children.map(resource => resource.rid)

            for (const resource of data.children)
                state.resources[resource.rid] = resource
        })

        return data
    }

    public async path(rid: Library.Resource.Rid): Promise<Library.API.Resource.Path.Response> {
        const data = await Library.API.Resource.path(api, rid)

        this.sdk.setState(state => {
            state.paths[rid] = data.path.map(resource => resource.rid)

            for (const resource of data.path)
                state.resources[resource.rid] = resource
        })

        return data
    }
}
