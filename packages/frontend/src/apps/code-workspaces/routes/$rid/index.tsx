import { createFileRoute } from '@tanstack/react-router'

/**
 * Code: the IDE. It's the layout's ($rid/route.tsx) — kept
 * mounted, only hidden on the other tabs, so VS Code doesn't reload when you
 * come back. Nothing of its own to render.
 */
export const Route = createFileRoute('/_workspace/code-workspaces/$rid/')({
    component: () => null,
})
