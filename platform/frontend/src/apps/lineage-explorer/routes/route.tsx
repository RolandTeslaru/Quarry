import { createFileRoute, Outlet } from '@tanstack/react-router'
import { App } from '@/AppKit'
import { lineageExplorerApp } from '../definition'

/** Lineage Explorer: the app itself, around every page of it — kept mounted as they change. */
export const Route = createFileRoute('/_shell/lineage-explorer')({
    component: () => (
        <App.Root app={lineageExplorerApp}>
            <Outlet />
        </App.Root>
    ),
})
