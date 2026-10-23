import { ActionGroup } from '@/SDKs/core/actions'
import { log } from '@/SDKs/core/log'
import type { DataConnectionSDKImpl } from '../sdk'
import { SourceActions } from './source'
import { SyncActions } from './sync'
import { RunActions } from './run'

/** `DataConnectionSDK.actions`: its groups, by what they act on. */
export class DataConnectionActions extends ActionGroup<DataConnectionSDKImpl> {

    protected readonly log = log.withContext('DataConnection.Actions')

    public readonly source = new SourceActions(this.sdk)

    public readonly sync = new SyncActions(this.sdk)

    public readonly run = new RunActions(this.sdk)
}
