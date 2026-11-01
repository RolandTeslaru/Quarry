import type { CodeWorkspace } from '@quarry/shared/domain'
import type { CodeWorkspaceSDK, CodeWorkspaceSDKImpl } from './sdk'

// After PretzelGraph's ExecutionSDK observers, like AuthSDK's: explicit transitions as named callbacks.

type WorkspaceRid = CodeWorkspace.Rid

/** Callbacks for CodeWorkspaceSDK's transitions, grouped by what changes. */
export type CodeWorkspaceObserver = {
    workspace?: {
        /** A workspace was opened (its page, by the route). */
        onOpen?: (workspaceRid: WorkspaceRid, meta: { previous?: WorkspaceRid }) => void
        /** The open workspace was closed — left, or another one opened (fires before its onOpen). */
        onClose?: (workspaceRid: WorkspaceRid, meta: { reason: 'switched' | 'closed' }) => void
    }
}

export type ObserveOptions = {
    /** If a workspace is already open at registration, replay onOpen for it now. */
    immediate?: boolean
}

type Transition = [next: WorkspaceRid | null, previous: WorkspaceRid | null]

export function observeCodeWorkspace(
    sdk:      CodeWorkspaceSDKImpl,
    observer: CodeWorkspaceObserver,
    options:  ObserveOptions = {},
): () => void {
    let disposed = false
    let draining = false

    const queue: Transition[] = []

    const emit = (next: WorkspaceRid | null, previous: WorkspaceRid | null) => {
        if (next === previous)
            return

        if (previous)
            observer.workspace?.onClose?.(previous, { reason: next ? 'switched' : 'closed' })

        if (next)
            observer.workspace?.onOpen?.(next, { previous: previous ?? undefined })
    }

    // A callback that writes to CodeWorkspaceSDK re-enters here synchronously: queue that
    // transition instead of nesting it, so handlers see them in the order they happened.
    const schedule = (next: WorkspaceRid | null, previous: WorkspaceRid | null) => {
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

    const unsubscribe = sdk.subscribe((state: CodeWorkspaceSDK.State, previous: CodeWorkspaceSDK.State) => {
        schedule(state.openWorkspaceRid, previous.openWorkspaceRid)
    })

    if (options.immediate)
        schedule(sdk.state.openWorkspaceRid, null)

    return () => {
        disposed = true
        queue.length = 0
        unsubscribe()
    }
}
