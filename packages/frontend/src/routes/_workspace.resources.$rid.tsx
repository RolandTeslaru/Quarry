import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { Foundations, Library } from '@quarry/shared/domain'
import { LibraryExplorerApp } from '@/apps/library/LibraryExplorerApp'
import { APPS } from '@/shell/apps'

export const Route = createFileRoute('/_workspace/resources/$rid')({
    params: {
        parse: params => {
            const parsed = Library.Resource.Rid.safeParse(params.rid)

            if (!parsed.success)
                throw notFound()

            return { rid: parsed.data }
        },
    },
    // The Library Explorer opens projects and folders; any other resource opens in its own app.
    beforeLoad: ({ params }) => {
        const type = Library.Resource.Type.safeParse(Foundations.Rid.parse(params.rid).type)

        if (!type.success)
            throw notFound()

        if (Library.Resource.CONTAINERS.includes(type.data))
            return

        const open = APPS.find(app => app.opens[type.data])?.opens[type.data]

        if (!open)
            throw notFound()

        throw redirect(open(params.rid))
    },
    component: ResourceRoute,
})

function ResourceRoute() {
    const { rid } = Route.useParams()

    return <LibraryExplorerApp cwd={rid} tab='files' />
}
