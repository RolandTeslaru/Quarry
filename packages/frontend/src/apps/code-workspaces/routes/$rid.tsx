import { createFileRoute, notFound } from '@tanstack/react-router'
import { App } from '@/AppKit'
import { CodeWorkspace } from '@quarry/shared/domain'
import { WorkspaceApp } from '@/apps/code-workspaces/components/WorkspaceApp'
import { CodeWorkspaceSDK } from '@/SDKs/CodeWorkspaceSDK/sdk'
import { orNotFound } from '@/utils/loader'
import { codeWorkspacesApp } from '../definition'

export const Route = createFileRoute('/_workspace/code-workspaces/$rid')({
    params: {
        parse: params => {
            const parsed = CodeWorkspace.Rid.safeParse(params.rid)

            if (!parsed.success)
                throw notFound()

            return { rid: parsed.data }
        },
    },
    // Entering opens the workspace: it and the audit `open` in one request. A hover (preload) only reads.
    loader: async ({ params, cause }) => {
        if (cause === 'enter')
            await orNotFound(CodeWorkspaceSDK.actions.workspace.open(params.rid, codeWorkspacesApp.id))
        else if (cause === 'preload')
            await CodeWorkspaceSDK.prefetch(CodeWorkspaceSDK.query.workspace(params.rid))
    },
    // A preload is only a read: a click after a hover must still run the loader, to open.
    preloadStaleTime: 0,
    pendingComponent: App.Pending,
    pendingMs: 0,
    component: WorkspaceRoute,
})

function WorkspaceRoute() {
    const { rid } = Route.useParams()

    return <WorkspaceApp key={rid} rid={rid} />
}
