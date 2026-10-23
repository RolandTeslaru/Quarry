import { ActionGroup } from '@/SDKs/core/actions'
import { log } from '@/SDKs/core/log'
import type { KeychainSDKImpl } from '../sdk'
import { TemplateActions } from './template'
import { CredentialActions } from './credential'

/** `KeychainSDK.actions`: its groups, by what they act on. */
export class KeychainActions extends ActionGroup<KeychainSDKImpl> {

    protected readonly log = log.withContext('Keychain.Actions')

    public readonly template = new TemplateActions(this.sdk)

    public readonly credential = new CredentialActions(this.sdk)
}
