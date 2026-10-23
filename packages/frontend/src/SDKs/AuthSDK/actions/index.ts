import { isAxiosError } from 'axios'
import { Identity } from '@quarry/shared/domain'
import { api, errorMessage } from '@/SDKs/api'
import { ActionGroup } from '@/SDKs/core/actions'
import { log } from '@/SDKs/core/log'
import { authClient } from '../client'
import type { AuthSDKImpl } from '../sdk'

type Credentials = {
    email:    string
    password: string
}

/** `AuthSDK.actions` */
export class AuthActions extends ActionGroup<AuthSDKImpl> {

    protected readonly log = log.withContext('Auth.Actions')

    async syncUser(): Promise<void> {
        if (!this.sdk.state.hasSession)
            return

        const revision = this.sdk.runtime.revision

        this.sdk.setState({
            access: 'checking',
            error: null,
        })

        try {
            const { user } = await Identity.API.Me.get(api)

            if (revision !== this.sdk.runtime.revision)
                return

            this.sdk.setState({
                user,
                access: 'granted',
            })
        } catch (error) {
            if (revision !== this.sdk.runtime.revision)
                return

            const status = isAxiosError(error) ? error.response?.status : undefined
            const denied = status === 401 || status === 403

            this.sdk.setState({
                user: null,
                access: denied ? 'denied' : 'unreachable',
                error: errorMessage(error),
            })
        }
    }

    async login(props: Credentials): Promise<void> {
        const { error } = await authClient.signInWithPassword(props)

        if (error)
            throw error
    }

    async signup(props: Credentials): Promise<boolean> {
        const { data, error } = await authClient.signUp(props)

        if (error)
            throw error

        return Boolean(data.session)
    }

    async logout(): Promise<void> {
        const { error } = await authClient.signOut({ scope: 'local' })

        if (error)
            throw error
    }
}
