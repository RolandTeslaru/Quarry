import { isAxiosError } from 'axios'
import { Identity } from '@quarry/shared/domain'
import { api, errorMessage } from '../api'
import { authClient } from './client'
import type { AuthSDKImpl } from './sdk'

type Credentials = {
    email:    string
    password: string
}

export type _AuthSDKActions = {
    syncUser: () => Promise<void>
    login:    (props: Credentials) => Promise<void>
    signup:   (props: Credentials) => Promise<boolean>
    logout:   () => Promise<void>
}

export function _createAuthActions_(sdk: AuthSDKImpl): _AuthSDKActions {
    const setState = sdk.useStore.setState

    return {
        syncUser: async () => {
            if (!sdk.state.hasSession)
                return

            const revision = sdk.runtime.revision

            setState({
                access: 'checking',
                error: null,
            })

            try {
                const { user } = await Identity.API.Me.get(api)

                if (revision !== sdk.runtime.revision)
                    return

                setState({
                    user,
                    access: 'granted',
                })
            } catch (error) {
                if (revision !== sdk.runtime.revision)
                    return

                const status = isAxiosError(error) ? error.response?.status : undefined
                const denied = status === 401 || status === 403

                setState({
                    user: null,
                    access: denied ? 'denied' : 'unreachable',
                    error: errorMessage(error),
                })
            }
        },

        login: async props => {
            const { error } = await authClient.signInWithPassword(props)

            if (error)
                throw error
        },

        signup: async props => {
            const { data, error } = await authClient.signUp(props)

            if (error)
                throw error

            return Boolean(data.session)
        },

        logout: async () => {
            const { error } = await authClient.signOut({ scope: 'local' })

            if (error)
                throw error
        },
    }
}
