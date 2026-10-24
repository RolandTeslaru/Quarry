import type { Keychain } from '@quarry/shared/domain'
import { createWithEqualityFn } from 'zustand/traditional'
import { immer } from 'zustand/middleware/immer'
import { shallow } from 'zustand/shallow'
import { BaseSDK } from '../core/BaseSDK'
import { KeychainActions } from './actions'
import { _createKeychainDialogs_, type _KeychainSDKDialogs } from './dialogs'
import { SDK } from '@quarry/standard-ui/SDKs/SDKManager'

const TEMPLATES_STALE_TIME = Infinity

@SDK('Keychain')
export class KeychainSDKImpl extends BaseSDK<KeychainSDK.State> {

    public readonly useStore: BaseSDK.Store<KeychainSDK.State> = createWithEqualityFn(
        immer<KeychainSDK.State>(() => ({
            credentials: [],
            templates: {},
        })),
        shallow,
    )

    public readonly actions: KeychainSDK.Actions = new KeychainActions(this)

    public readonly dialogs: KeychainSDK.Dialogs = _createKeychainDialogs_()

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
            templates: {},
        })
    }
}

export const KeychainSDK = SDK.get<KeychainSDKImpl>('Keychain')

export namespace KeychainSDK {

    export type State = {
        credentials: Keychain.Credential.Schema[]
        templates:   Record<Keychain.Credential.Template.Id, Keychain.Credential.Template.Schema>
    }

    export type Actions = KeychainActions
    export type Dialogs = _KeychainSDKDialogs
}
