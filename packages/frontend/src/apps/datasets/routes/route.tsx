import { createFileRoute, Outlet } from '@tanstack/react-router'
import { App } from '@/AppKit'
import { datasetsApp } from '../definition'

/** Datasets: the app itself, around every page of it — kept mounted as they change. */
export const Route = createFileRoute('/_workspace/datasets')({
    component: () => (
        <App.Root app={datasetsApp}>
            <Outlet />
        </App.Root>
    ),
})
