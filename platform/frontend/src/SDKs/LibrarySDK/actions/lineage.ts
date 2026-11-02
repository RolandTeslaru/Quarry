import { Library } from '@quarry/shared/domain'
import { api } from '@/SDKs/api'
import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import type { LibrarySDKImpl } from '../sdk'

/** `LibrarySDK.actions.lineage` — read-only and per screen, so the query cache holds the results. */
export class LineageActions extends ActionGroup<LibrarySDKImpl> {

    protected readonly log = log.withContext('Library.Actions.Lineage')

    public async getUpstream(rid: Library.Resource.Rid, request: Library.API.Lineage.Get.Request): Promise<Library.API.Lineage.Get.Response> {
        return Library.API.Lineage.getUpstream(api, rid, request)
    }

    public async getDownstream(rid: Library.Resource.Rid, request: Library.API.Lineage.Get.Request): Promise<Library.API.Lineage.Get.Response> {
        return Library.API.Lineage.getDownstream(api, rid, request)
    }

    public async getGraph(request: Library.API.Lineage.GetGraph.Request): Promise<Library.API.Lineage.GetGraph.Response> {
        return Library.API.Lineage.getGraph(api, request)
    }
}
