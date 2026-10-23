import { createFileRoute, Outlet } from '@tanstack/react-router'
import { App } from '@/AppKit'
import { layoutDemoApp } from '../definition'

/** Layout demo: the app itself, around every page of it — kept mounted as they change. */
export const Route = createFileRoute('/_workspace/layout-demo')({
    component: () => (
        <App.Root app={layoutDemoApp}>
            <Outlet />
        </App.Root>
    ),
})
