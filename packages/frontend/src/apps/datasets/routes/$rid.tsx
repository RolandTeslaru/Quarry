import { createFileRoute, notFound } from '@tanstack/react-router'
import { Catalog } from '@quarry/shared/domain'
import { DatasetApp } from '@/apps/datasets/components/DatasetApp'

export const Route = createFileRoute('/_workspace/datasets/$rid')({
    params: {
        parse: params => {
            const parsed = Catalog.Dataset.Rid.safeParse(params.rid)

            if (!parsed.success)
                throw notFound()

            return { rid: parsed.data }
        },
    },
    component: DatasetRoute,
})

function DatasetRoute() {
    const { rid } = Route.useParams()

    return <DatasetApp key={rid} rid={rid} />
}
