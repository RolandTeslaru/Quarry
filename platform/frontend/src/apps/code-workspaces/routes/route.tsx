import { createFileRoute, Outlet } from '@tanstack/react-router'
import { App } from '@/AppKit'
import { codeWorkspacesApp } from '../definition'

/** Code Workspaces: the app itself, around every page of it — kept mounted as they change. */
export const Route = createFileRoute('/_workspace/code-workspaces')({
    component: () => (
        <App.Root app={codeWorkspacesApp}>
            <Outlet />
        </App.Root>
    ),
})
