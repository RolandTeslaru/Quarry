import { createFileRoute, Outlet } from '@tanstack/react-router'
import { App } from '@/AppKit'
import { forgeApp } from '../definition'

/** Forge: the app itself, around every page of it — kept mounted as they change. */
export const Route = createFileRoute('/_workspace/forge')({
    component: () => (
        <App.Root app={forgeApp}>
            <Outlet />
        </App.Root>
    ),
})
