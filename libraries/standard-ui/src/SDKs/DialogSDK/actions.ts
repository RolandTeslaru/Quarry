import { ActionGroup, log } from '../core'
import type { DialogSDK, DialogSDKImpl } from './sdk'

/** `DialogSDK.actions` */
export class DialogActions extends ActionGroup<DialogSDKImpl> {

    protected readonly log = log.withContext('Dialog.Actions')

    // A popped dialog stays mounted for its exit animation, then is removed.
    private readonly removals = new Map<string, ReturnType<typeof setTimeout>>()

    public push(dialogId: string, renderer: DialogSDK.Renderer): void {
        this.cancelRemoval(dialogId)

        this.sdk.useStore.setState((state) => {
            state.dialogs.set(dialogId, {
                dialogId,
                isOpen: true,
                renderer,
            })
        })
    }

    public pop(dialogId: string): void {
        if (!this.sdk.state.dialogs.has(dialogId)) {
            return
        }

        this.sdk.useStore.setState((state) => {
            const entry = state.dialogs.get(dialogId)

            if (entry) {
                entry.isOpen = false
            }
        })

        this.cancelRemoval(dialogId)

        const removal = setTimeout(() => {
            this.sdk.useStore.setState((state) => {
                state.dialogs.delete(dialogId)
            })

            this.removals.delete(dialogId)
        }, this.sdk.EXIT_ANIMATION_MS)

        this.removals.set(dialogId, removal)
    }

    public popAll(): void {
        for (const dialogId of this.sdk.state.dialogs.keys()) {
            this.pop(dialogId)
        }
    }

    /** The SDK's cleanup: pending removals cancelled, every dialog gone at once. */
    public clear(): void {
        for (const dialogId of this.removals.keys()) {
            this.cancelRemoval(dialogId)
        }

        this.sdk.useStore.setState((state) => {
            state.dialogs.clear()
        })
    }

    private cancelRemoval(dialogId: string): void {
        clearTimeout(this.removals.get(dialogId))
        this.removals.delete(dialogId)
    }
}
