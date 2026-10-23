import { createFileRoute, Outlet } from '@tanstack/react-router'
import { App } from '@/AppKit'
import { dataConnectionApp } from '../definition'

/** Data Connection: the app itself, around every page of it — kept mounted as they change. */
export const Route = createFileRoute('/_workspace/data-connection')({
    component: () => (
        <App.Root app={dataConnectionApp}>
            <Outlet />
        </App.Root>
    ),
})
