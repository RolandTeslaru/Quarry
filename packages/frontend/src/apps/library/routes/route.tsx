import { createFileRoute, Outlet } from '@tanstack/react-router'
import { App } from '@/AppKit'
import { libraryApp } from '../definition'

/** Library Explorer: the app itself, around every page of it — kept mounted as they change. */
export const Route = createFileRoute('/_workspace/library')({
    component: () => (
        <App.Root app={libraryApp}>
            <Outlet />
        </App.Root>
    ),
})
