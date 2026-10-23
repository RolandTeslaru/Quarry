import { Keychain } from '@quarry/shared/domain'
import { api } from '@/SDKs/api'
import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import type { KeychainSDKImpl } from '../sdk'

/** `KeychainSDK.actions.template` */
export class TemplateActions extends ActionGroup<KeychainSDKImpl> {

    protected readonly log = log.withContext('Keychain.Actions.Template')

    public async list(): Promise<Keychain.API.Credential.ListTemplates.Response> {
        const data = await Keychain.API.Credential.listTemplates(api)

        this.sdk.setState({ templates: data.templates })

        return data
    }
}
