import { createFileRoute, Outlet } from '@tanstack/react-router'
import { App } from '@/AppKit'
import { ontologyStudioApp } from '../definition'

/** Ontology Studio: the app itself, around every page of it — kept mounted as they change. */
export const Route = createFileRoute('/_shell/ontology-studio')({
    component: () => (
        <App.Root app={ontologyStudioApp}>
            <Outlet />
        </App.Root>
    ),
})
