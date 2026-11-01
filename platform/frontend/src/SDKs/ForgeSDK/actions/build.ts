import { Forge } from '@quarry/shared/domain'
import { api } from '@/SDKs/api'
import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import type { ForgeSDKImpl } from '../sdk'

/** `ForgeSDK.actions.build` */
export class BuildActions extends ActionGroup<ForgeSDKImpl> {

    protected readonly log = log.withContext('Forge.Actions.Build')

    public async list(): Promise<Forge.API.ListBuilds.Response> {
        const data = await Forge.API.listBuilds(api)

        this.sdk.setState({ builds: data.builds })

        return data
    }
}
