import { Keychain } from '@quarry/shared/domain'
import { api } from '@/SDKs/api'
import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import type { KeychainSDKImpl } from '../sdk'

/** `KeychainSDK.actions.credential` */
export class CredentialActions extends ActionGroup<KeychainSDKImpl> {

    protected readonly log = log.withContext('Keychain.Actions.Credential')

    public async list(): Promise<Keychain.API.Credential.List.Response> {
        const data = await Keychain.API.Credential.list(api)

        this.sdk.setState({ credentials: data.credentials })

        return data
    }

    public async create(request: Keychain.API.Credential.Create.Request): Promise<Keychain.Credential.Schema> {
        const { credential } = await Keychain.API.Credential.create(api, request)

        await this.sdk.invalidate(this.sdk.query.credentials)

        return credential
    }

    public reveal(rid: Keychain.Credential.Rid): Promise<Keychain.API.Credential.Reveal.Response> {
        return Keychain.API.Credential.reveal(api, rid)
    }

    public async update(rid: Keychain.Credential.Rid, values: Keychain.Credential.Values): Promise<void> {
        await Keychain.API.Credential.updateValues(api, rid, { values })
    }
}
