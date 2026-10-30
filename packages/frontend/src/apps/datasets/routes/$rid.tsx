import { createFileRoute, notFound } from '@tanstack/react-router'
import { App } from '@/AppKit'
import { Dataset } from '@quarry/shared/domain'
import { DatasetApp } from '@/apps/datasets/components/DatasetApp'
import { CatalogSDK } from '@/SDKs/CatalogSDK/sdk'
import { orNotFound } from '@/utils/loader'
import { datasetsApp } from '../definition'

export const Route = createFileRoute('/_workspace/datasets/$rid')({
    params: {
        parse: params => {
            const parsed = Dataset.Rid.safeParse(params.rid)

            if (!parsed.success)
                throw notFound()

            return { rid: parsed.data }
        },
    },
    // Entering opens the dataset: its data and the audit `open` in one request. A hover
    // (preload) fetches only the metadata — the view and rows are audited reads; a search
    // change (stay) does neither.
    loader: async ({ params, cause }) => {
        if (cause === 'enter')
            await orNotFound(CatalogSDK.actions.dataset.open(params.rid, datasetsApp.id))
        else if (cause === 'preload')
            await CatalogSDK.prefetch(CatalogSDK.query.dataset(params.rid))
    },
    // A preload is only a read: a click after a hover must still run the loader, to open.
    preloadStaleTime: 0,
    pendingComponent: App.Pending,
    pendingMs: 0,
    component: DatasetRoute,
})

function DatasetRoute() {
    const { rid } = Route.useParams()

    return <DatasetApp key={rid} rid={rid} />
}
