import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import type { ForgeSDKImpl } from '../sdk'
import { BuildActions } from './build'
import { StalenessActions } from './staleness'

/** `ForgeSDK.actions`: its groups, by what they act on. */
export class ForgeActions extends ActionGroup<ForgeSDKImpl> {

    protected readonly log = log.withContext('Forge.Actions')

    public readonly build = new BuildActions(this.sdk)

    public readonly staleness = new StalenessActions(this.sdk)
}
