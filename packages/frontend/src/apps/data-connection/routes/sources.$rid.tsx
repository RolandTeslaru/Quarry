import { createFileRoute, notFound } from '@tanstack/react-router'
import { App } from '@/AppKit'
import { DataConnection } from '@quarry/shared/domain'
import { SourceApp } from '@/apps/data-connection/components/SourceApp'
import { DataConnectionSDK } from '@/SDKs/DataConnectionSDK/sdk'
import { orNotFound } from '@/utils/loader'
import { dataConnectionApp } from '../definition'

/** The table shown in the content: `?schema=public&table=customers`. Neither means the syncs. */
export interface SourceSearch {
    schema?: string
    table?:  string
}

export const Route = createFileRoute('/_workspace/data-connection/sources/$rid')({
    // A table needs both halves; half of one is none.
    validateSearch: (search: Record<string, unknown>): SourceSearch =>
        typeof search.schema === 'string' && typeof search.table === 'string'
            ? { schema: search.schema, table: search.table }
            : {},
    params: {
        parse: params => {
            const parsed = DataConnection.Source.Rid.safeParse(params.rid)

            if (!parsed.success)
                throw notFound()

            return { rid: parsed.data }
        },
    },
    // Entering opens the source: its data and the audit `open` in one request; then its runs
    // go live until it closes (DataConnectionSDK decides what open means). A hover (preload)
    // only reads; a search change (stay) does neither.
    loader: async ({ params, cause }) => {
        if (cause === 'enter')
            await orNotFound(DataConnectionSDK.actions.source.open(params.rid, dataConnectionApp.id))
        else if (cause === 'preload')
            await DataConnectionSDK.prefetch(DataConnectionSDK.query.source(params.rid))
    },
    onLeave: match => DataConnectionSDK.actions.source.close(match.params.rid),
    // A preload is only a read: a click after a hover must still run the loader, to open.
    preloadStaleTime: 0,
    pendingComponent: App.Pending,
    pendingMs: 0,
    component: SourceRoute,
})

function SourceRoute() {
    const { rid } = Route.useParams()
    const { schema, table } = Route.useSearch()

    return <SourceApp key={rid} rid={rid} table={schema && table ? { schema, name: table } : null} />
}
