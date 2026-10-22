import type { DialogSDK, DialogSDKImpl } from './sdk'

export interface DialogSDKActions {
    push: (dialogId: string, renderer: DialogSDK.Renderer) => void
    pop: (dialogId: string) => void
    popAll: () => void
}

export function createDialogSDKActions(sdk: DialogSDKImpl) {
    const removals = new Map<string, ReturnType<typeof setTimeout>>()

    function cancelRemoval(dialogId: string) {
        clearTimeout(removals.get(dialogId))
        removals.delete(dialogId)
    }

    const actions: DialogSDKActions = {
        push(dialogId, renderer) {
            cancelRemoval(dialogId)

            sdk.useStore.setState((state) => {
                state.dialogs.set(dialogId, {
                    dialogId,
                    isOpen: true,
                    renderer,
                })
            })
        },

        pop(dialogId) {
            if (!sdk.state.dialogs.has(dialogId)) {
                return
            }

            sdk.useStore.setState((state) => {
                const entry = state.dialogs.get(dialogId)

                if (entry) {
                    entry.isOpen = false
                }
            })

            cancelRemoval(dialogId)

            const removal = setTimeout(() => {
                sdk.useStore.setState((state) => {
                    state.dialogs.delete(dialogId)
                })

                removals.delete(dialogId)
            }, sdk.EXIT_ANIMATION_MS)

            removals.set(dialogId, removal)
        },

        popAll() {
            for (const dialogId of sdk.state.dialogs.keys()) {
                actions.pop(dialogId)
            }
        },
    }

    function cleanup() {
        for (const dialogId of removals.keys()) {
            cancelRemoval(dialogId)
        }

        sdk.useStore.setState((state) => {
            state.dialogs.clear()
        })
    }

    return { actions, cleanup }
}
