import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import type { LibrarySDKImpl } from '../sdk'
import { ProjectActions } from './project'
import { FolderActions } from './folder'
import { ResourceActions } from './resource'

/** `LibrarySDK.actions`: its groups, by what they act on. */
export class LibraryActions extends ActionGroup<LibrarySDKImpl> {

    protected readonly log = log.withContext('Library.Actions')

    public readonly project = new ProjectActions(this.sdk)

    public readonly folder = new FolderActions(this.sdk)

    public readonly resource = new ResourceActions(this.sdk)
}
