import { createFileRoute, Outlet } from '@tanstack/react-router'
import { App } from '@/AppKit'
import { keychainApp } from '../definition'

/** Keychain: the app itself, around every page of it — kept mounted as they change. */
export const Route = createFileRoute('/_workspace/keychain')({
    component: () => (
        <App.Root app={keychainApp}>
            <Outlet />
        </App.Root>
    ),
})
