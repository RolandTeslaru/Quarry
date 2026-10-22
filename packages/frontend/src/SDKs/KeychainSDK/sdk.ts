import type { Keychain } from '@quarry/shared/domain'
import { createWithEqualityFn } from 'zustand/traditional'
import { immer } from 'zustand/middleware/immer'
import { shallow } from 'zustand/shallow'
import { BaseSDK } from '../core/BaseSDK'
import { _createKeychainActions_, type _KeychainSDKActions } from './actions'

const TEMPLATES_STALE_TIME = Infinity

export class KeychainSDKImpl extends BaseSDK<KeychainSDK.State> {

    public readonly useStore: BaseSDK.Store<KeychainSDK.State> = createWithEqualityFn(
        immer<KeychainSDK.State>(() => ({
            credentials: [],
            templates: [],
        })),
        shallow,
    )

    public readonly actions: KeychainSDK.Actions = _createKeychainActions_(this)

    public override readonly query = {
        credentials: {
            queryKey: ['keychain', 'credentials'] as const,
            queryFn: () => this.actions.credential.list(),
        },

        templates: {
            queryKey: ['keychain', 'templates'] as const,
            queryFn: () => this.actions.template.list(),
            staleTime: TEMPLATES_STALE_TIME,
        },
    }

    public override cleanup(): void {
        this.setState({
            credentials: [],
            templates: [],
        })
    }
}

export const KeychainSDK = new KeychainSDKImpl()

export namespace KeychainSDK {

    export type State = {
        credentials: Keychain.Credential.Schema[]
        templates:   Keychain.Credential.Template.Schema[]
    }

    export type Actions = _KeychainSDKActions
}
