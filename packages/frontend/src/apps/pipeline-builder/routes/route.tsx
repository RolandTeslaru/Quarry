import { createFileRoute, Outlet } from '@tanstack/react-router'
import { App } from '@/AppKit'
import { pipelineBuilderApp } from '../definition'

/** Pipeline Builder: the app itself, around every page of it — kept mounted as they change. */
export const Route = createFileRoute('/_workspace/pipeline-builder')({
    component: () => (
        <App.Root app={pipelineBuilderApp}>
            <Outlet />
        </App.Root>
    ),
})
