import { createFileRoute, notFound } from '@tanstack/react-router'
import { LineageExplorer } from '@quarry/shared/domain'
import { App } from '@/AppKit'
import { ExplorationApp } from '@/apps/lineage-explorer/components/ExplorationApp'
import { LineageExplorerSDK } from '@/SDKs/LineageExplorerSDK/sdk'
import { orNotFound } from '@/utils/loader'
import { lineageExplorerApp } from '../definition'

export const Route = createFileRoute('/_workspace/lineage-explorer/$rid')({
    params: {
        parse: params => {
            const parsed = LineageExplorer.Exploration.Rid.safeParse(params.rid)

            if (!parsed.success)
                throw notFound()

            return { rid: parsed.data }
        },
    },
    // Entering opens the exploration: it, its graph read now, and the audit `open`, in one request.
    loader: async ({ params, cause }) => {
        if (cause === 'enter')
            await orNotFound(LineageExplorerSDK.actions.exploration.open(params.rid, lineageExplorerApp.id))
    },
    preloadStaleTime: 0,
    pendingComponent: App.Pending,
    pendingMs: 0,
    component: ExplorationRoute,
})

function ExplorationRoute() {
    const { rid } = Route.useParams()

    return <ExplorationApp key={rid} rid={rid} />
}
