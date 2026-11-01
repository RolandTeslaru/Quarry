import type { Identity } from '@quarry/shared/domain'
import type { AuthSDK, AuthSDKImpl } from './sdk'

// After PretzelGraph's ExecutionSDK observers: explicit transitions as named callbacks.

type Member = Identity.User.Schema

/** Callbacks for AuthSDK's transitions, grouped by what changes. */
export type AuthObserver = {
    session?: {
        /** A member is in: their access was granted. */
        onStart?: (member: Member, meta: { previous?: Member }) => void
        /**
         * Their session ended: signed out, switched to another user (fires before
         * that user's onStart), or still signed in but access no longer granted.
         */
        onEnd?: (member: Member, meta: { reason: 'signed-out' | 'switched' | 'lost' }) => void
    }
}

export type ObserveOptions = {
    /** If a member is already signed in at registration, replay onStart for them now. */
    immediate?: boolean
}

type Transition = [next: AuthSDK.State, previous: AuthSDK.State | undefined]

/** The signed-in member while access is granted, else none. */
const memberOf = (state: AuthSDK.State): Member | undefined =>
    state.access === 'granted' ? state.user ?? undefined : undefined

export function observeAuth(sdk: AuthSDKImpl, observer: AuthObserver, options: ObserveOptions = {}): () => void {
    let disposed = false
    let draining = false

    const queue: Transition[] = []

    const emit = (next: AuthSDK.State, previous: AuthSDK.State | undefined) => {
        const member = memberOf(next)
        const previousMember = previous ? memberOf(previous) : undefined

        if (member?.rid === previousMember?.rid)
            return

        if (previousMember)
            observer.session?.onEnd?.(previousMember, { reason: endReason(next, member) })

        if (member)
            observer.session?.onStart?.(member, { previous: previousMember })
    }

    // A callback that writes to AuthSDK re-enters here synchronously: queue that
    // transition instead of nesting it, so handlers see them in the order they happened.
    const schedule = (next: AuthSDK.State, previous: AuthSDK.State | undefined) => {
        if (disposed)
            return

        queue.push([next, previous])

        if (draining)
            return

        draining = true

        try {
            while (queue.length > 0 && !disposed) {
                const [nextState, previousState] = queue.shift()!

                emit(nextState, previousState)
            }
        }
        finally {
            draining = false
            queue.length = 0
        }
    }

    const unsubscribe = sdk.subscribe((state, previous) => schedule(state, previous))

    if (options.immediate)
        schedule(sdk.state, undefined)

    return () => {
        disposed = true
        queue.length = 0
        unsubscribe()
    }
}

function endReason(next: AuthSDK.State, member: Member | undefined): 'signed-out' | 'switched' | 'lost' {
    if (member)
        return 'switched'

    return next.hasSession ? 'lost' : 'signed-out'
}
