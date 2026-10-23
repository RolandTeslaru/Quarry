import type { Session } from '@supabase/auth-js'
import type { Identity } from '@quarry/shared/domain'
import { createWithEqualityFn } from 'zustand/traditional'
import { immer } from 'zustand/middleware/immer'
import { shallow } from 'zustand/shallow'
import { BaseSDK } from '../core/BaseSDK'
import { cleanupSDKs } from '../cleanup'
import { authClient } from './client'
import { AuthActions } from './actions'
import { observeAuth, type AuthObserver, type ObserveOptions as ObserveOptions_ } from './observe'
import { SDK } from '@quarry/standard-ui/SDKs/SDKManager'

@SDK('Auth')
export class AuthSDKImpl extends BaseSDK<AuthSDK.State> {

    public readonly useStore: BaseSDK.Store<AuthSDK.State> = createWithEqualityFn(
        immer<AuthSDK.State>(() => ({
            hasSession: null,
            access: 'checking',
            user: null,
            error: null,
        })),
        shallow,
    )

    public readonly runtime = {
        userId: null as string | null,
        revision: 0,
        unsubscribe: null as (() => void) | null,
    }

    public readonly actions: AuthSDK.Actions = new AuthActions(this)

    public init(): () => void {
        this.runtime.unsubscribe?.()

        const { data } = authClient.onAuthStateChange((_event, session) => {
            this.handleSessionChange(session)
        })

        const unsubscribe = () => data.subscription.unsubscribe()

        this.runtime.unsubscribe = unsubscribe

        return unsubscribe
    }

    /** Named callbacks for AuthSDK's transitions (`session.onStart`, `session.onEnd`); returns its own removal. */
    public observe(observer: AuthSDK.Observer, options?: AuthSDK.ObserveOptions): () => void {
        return observeAuth(this, observer, options)
    }

    private handleSessionChange(session: Session | null): void {
        const userId = session?.user.id ?? null

        if (session && userId === this.runtime.userId)
            return

        this.runtime.userId = userId
        this.runtime.revision++

        cleanupSDKs()

        this.setState({
            hasSession: session !== null,
            access: session ? 'checking' : 'denied',
            user: null,
            error: null,
        })

        if (!session)
            return

        const revision = this.runtime.revision

        // Defer client calls until GoTrue releases its auth-state callback lock.
        setTimeout(() => {
            if (revision !== this.runtime.revision)
                return

            void this.actions.syncUser()
        }, 0)
    }

    public override cleanup(): void {
        this.runtime.revision++
        this.runtime.userId = null
        this.runtime.unsubscribe?.()
        this.runtime.unsubscribe = null

        cleanupSDKs()

        this.setState({
            hasSession: false,
            access: 'denied',
            user: null,
            error: null,
        })
    }
}

export const AuthSDK = SDK.get<AuthSDKImpl>('Auth')

export namespace AuthSDK {

    export type Access = 'checking' | 'granted' | 'denied' | 'unreachable'

    export type State = {
        hasSession: boolean | null
        access:     Access
        user:       Identity.User.Schema | null
        error:      string | null
    }

    export type Actions = AuthActions

    export type Observer       = AuthObserver
    export type ObserveOptions = ObserveOptions_
}
