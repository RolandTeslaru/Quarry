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
    // Entering opens the exploration: its graph, read now, becomes the current one, and the audit `open` is recorded.
    loader: async ({ params, cause }) => {
        if (cause === 'enter')
            await orNotFound(LineageExplorerSDK.actions.exploration.open(params.rid, lineageExplorerApp.id))
    },
    onLeave: match => LineageExplorerSDK.actions.exploration.close(match.params.rid),
    preloadStaleTime: 0,
    pendingComponent: App.Pending,
    pendingMs: 0,
    component: ExplorationRoute,
})

function ExplorationRoute() {
    const { rid } = Route.useParams()

    return <ExplorationApp key={rid} rid={rid} />
}
