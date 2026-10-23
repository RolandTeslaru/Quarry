import { createFileRoute, notFound } from '@tanstack/react-router'
import { DataConnection } from '@quarry/shared/domain'
import { SourceApp } from '@/apps/data-connection/components/SourceApp'
import { DataConnectionSDK } from '@/SDKs/DataConnectionSDK/sdk'

export const Route = createFileRoute('/_workspace/data-connection/sources/$rid')({
    params: {
        parse: params => {
            const parsed = DataConnection.Source.Rid.safeParse(params.rid)

            if (!parsed.success)
                throw notFound()

            return { rid: parsed.data }
        },
    },
    // The route says which source is open; DataConnectionSDK decides what that means (its runs go live).
    onEnter: match => DataConnectionSDK.actions.source.open(match.params.rid),
    onStay:  match => DataConnectionSDK.actions.source.open(match.params.rid),
    onLeave: match => DataConnectionSDK.actions.source.close(match.params.rid),
    component: SourceRoute,
})

function SourceRoute() {
    const { rid } = Route.useParams()

    return <SourceApp key={rid} rid={rid} />
}
