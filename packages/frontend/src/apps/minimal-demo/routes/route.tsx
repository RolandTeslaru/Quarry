import { createFileRoute, Outlet } from '@tanstack/react-router'
import { App } from '@/AppKit'
import { minimalDemoApp } from '../definition'

/** Minimal demo: the app itself, around every page of it — kept mounted as they change. */
export const Route = createFileRoute('/_workspace/minimal-demo')({
    component: () => (
        <App.Root app={minimalDemoApp}>
            <Outlet />
        </App.Root>
    ),
})
