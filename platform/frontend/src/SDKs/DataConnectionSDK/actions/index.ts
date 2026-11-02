import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import type { DataConnectionSDKImpl } from '../sdk'
import { SourceActions } from './source'
import { SyncActions } from './sync'

/** `DataConnectionSDK.actions`: its groups, by what they act on. */
export class DataConnectionActions extends ActionGroup<DataConnectionSDKImpl> {

    protected readonly log = log.withContext('DataConnection.Actions')

    public readonly source = new SourceActions(this.sdk)

    public readonly sync = new SyncActions(this.sdk)
}
