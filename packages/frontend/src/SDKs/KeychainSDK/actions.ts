import { Keychain } from '@quarry/shared/domain'
import { api } from '../api'
import type { KeychainSDKImpl } from './sdk'

export type _KeychainSDKActions = {
    template: {
        list: () => Promise<Keychain.API.Credential.ListTemplates.Response>
    }
    credential: {
        list:   () => Promise<Keychain.API.Credential.List.Response>
        create: (request: Keychain.API.Credential.Create.Request) => Promise<Keychain.Credential.Schema>
        reveal: (rid: Keychain.Credential.Rid) => Promise<Keychain.API.Credential.Reveal.Response>
        update: (rid: Keychain.Credential.Rid, values: Keychain.Credential.Values) => Promise<void>
    }
}

export function _createKeychainActions_(sdk: KeychainSDKImpl): _KeychainSDKActions {
    const setState = sdk.useStore.setState

    return {
        template: {
            list: async () => {
                const data = await Keychain.API.Credential.listTemplates(api)

                setState({ templates: data.templates })

                return data
            },
        },

        credential: {
            list: async () => {
                const data = await Keychain.API.Credential.list(api)

                setState({ credentials: data.credentials })

                return data
            },

            create: async request => {
                const { credential } = await Keychain.API.Credential.create(api, request)

                await sdk.invalidate(sdk.query.credentials)

                return credential
            },

            reveal: rid =>
                Keychain.API.Credential.reveal(api, rid),

            update: (rid, values) =>
                Keychain.API.Credential.updateValues(api, rid, { values }),
        },
    }
}
