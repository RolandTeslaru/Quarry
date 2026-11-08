import { useEffect } from 'react'
import { LineageExplorerSDK } from '../../sdk'

/** Undo (⌘Z) and redo (⇧⌘Z, or Ctrl+Y) while the canvas is open, unless typing in a field. */
export function useKeyBindings() {
    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            const target = event.target as HTMLElement

            if (target.isContentEditable || target.closest('input, textarea, select'))
                return

            if (!(event.metaKey || event.ctrlKey))
                return

            const key = event.key.toLowerCase()

            if (key === 'z' && event.shiftKey) {
                event.preventDefault()
                LineageExplorerSDK.actions.history.redo()
            } else if (key === 'z') {
                event.preventDefault()
                LineageExplorerSDK.actions.history.undo()
            } else if (key === 'y') {
                event.preventDefault()
                LineageExplorerSDK.actions.history.redo()
            }
        }

        window.addEventListener('keydown', onKeyDown)

        return () => window.removeEventListener('keydown', onKeyDown)
    }, [])
}
