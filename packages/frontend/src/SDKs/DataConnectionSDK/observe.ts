import type { DataConnection } from '@quarry/shared/domain'
import type { DataConnectionSDK, DataConnectionSDKImpl } from './sdk'

// After PretzelGraph's ExecutionSDK observers, like AuthSDK's: explicit transitions as named callbacks.

type SourceRid = DataConnection.Source.Rid

/** Callbacks for DataConnectionSDK's transitions, grouped by what changes. */
export type DataConnectionObserver = {
    source?: {
        /** A source was opened (its page, by the route). */
        onOpen?: (sourceRid: SourceRid, meta: { previous?: SourceRid }) => void
        /** The open source was closed — left, or another one opened (fires before its onOpen). */
        onClose?: (sourceRid: SourceRid, meta: { reason: 'switched' | 'closed' }) => void
    }
}

export type ObserveOptions = {
    /** If a source is already open at registration, replay onOpen for it now. */
    immediate?: boolean
}

type Transition = [next: SourceRid | null, previous: SourceRid | null]

export function observeDataConnection(
    sdk:      DataConnectionSDKImpl,
    observer: DataConnectionObserver,
    options:  ObserveOptions = {},
): () => void {
    let disposed = false
    let draining = false

    const queue: Transition[] = []

    const emit = (next: SourceRid | null, previous: SourceRid | null) => {
        if (next === previous)
            return

        if (previous)
            observer.source?.onClose?.(previous, { reason: next ? 'switched' : 'closed' })

        if (next)
            observer.source?.onOpen?.(next, { previous: previous ?? undefined })
    }

    // A callback that writes to DataConnectionSDK re-enters here synchronously: queue that
    // transition instead of nesting it, so handlers see them in the order they happened.
    const schedule = (next: SourceRid | null, previous: SourceRid | null) => {
        if (disposed)
            return

        queue.push([next, previous])

        if (draining)
            return

        draining = true

        try {
            while (queue.length > 0 && !disposed) {
                const [nextRid, previousRid] = queue.shift()!

                emit(nextRid, previousRid)
            }
        }
        finally {
            draining = false
            queue.length = 0
        }
    }

    const unsubscribe = sdk.subscribe((state: DataConnectionSDK.State, previous: DataConnectionSDK.State) => {
        schedule(state.openSourceRid, previous.openSourceRid)
    })

    if (options.immediate)
        schedule(sdk.state.openSourceRid, null)

    return () => {
        disposed = true
        queue.length = 0
        unsubscribe()
    }
}
