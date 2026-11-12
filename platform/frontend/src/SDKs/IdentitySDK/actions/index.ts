import { Identity } from '@quarry/shared/domain'
import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import { api } from '@/SDKs/api'
import type { IdentitySDK, IdentitySDKImpl } from '../sdk'

/** `IdentitySDK.actions` */
export class IdentityActions extends ActionGroup<IdentitySDKImpl> {

    protected readonly log = log.withContext('Identity.Actions')

    public async getUsers(): Promise<IdentitySDK.Users> {
        const { users } = await Identity.API.Users.list(api)
        const byRid: IdentitySDK.Users = {}

        for (const user of users)
            byRid[user.rid] = user

        return byRid
    }
}
