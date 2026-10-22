import { createFileRoute, notFound } from '@tanstack/react-router'
import { Library } from '@quarry/shared/domain'
import { ResourcePanel } from '@/SDKs/LibrarySDK/ui/ResourcePanel'

export const Route = createFileRoute('/_workspace/resources/$rid')({
    params: {
        parse: params => {
            const parsed = Library.Resource.Rid.safeParse(params.rid)

            if (!parsed.success)
                throw notFound()

            return { rid: parsed.data }
        },
    },
    component: ResourceRoute,
})

function ResourceRoute() {
    const { rid } = Route.useParams()

    return <ResourcePanel key={rid} rid={rid} />
}
