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

    return (
        <div className='max-w-[1560px] px-10 pt-8 pb-15 max-[900px]:p-6'>
            <ResourcePanel key={rid} rid={rid} />
        </div>
    )
}
