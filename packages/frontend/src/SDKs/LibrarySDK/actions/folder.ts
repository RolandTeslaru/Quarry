import { Library } from '@quarry/shared/domain'
import { api } from '@/SDKs/api'
import { ActionGroup } from '@/SDKs/core/actions'
import { log } from '@/SDKs/core/log'
import type { LibrarySDKImpl } from '../sdk'

/** `LibrarySDK.actions.folder` */
export class FolderActions extends ActionGroup<LibrarySDKImpl> {

    protected readonly log = log.withContext('Library.Actions.Folder')

    async create(request: Library.API.Folder.Create.Request): Promise<Library.Folder.Schema> {
        const { folder } = await Library.API.Folder.create(api, request)

        await this.sdk.invalidate(this.sdk.query.children(request.parentRid))

        return folder
    }
}
