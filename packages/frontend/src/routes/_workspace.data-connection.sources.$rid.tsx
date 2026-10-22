import { createFileRoute, notFound } from '@tanstack/react-router'
import { DataConnection } from '@quarry/shared/domain'
import { SourceApp } from '@/apps/data-connection/SourceApp'

export const Route = createFileRoute('/_workspace/data-connection/sources/$rid')({
    params: {
        parse: params => {
            const parsed = DataConnection.Source.Rid.safeParse(params.rid)

            if (!parsed.success)
                throw notFound()

            return { rid: parsed.data }
        },
    },
    component: SourceRoute,
})

function SourceRoute() {
    const { rid } = Route.useParams()

    return <SourceApp key={rid} rid={rid} />
}
