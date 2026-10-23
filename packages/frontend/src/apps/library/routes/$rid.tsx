import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { Foundations, Library } from '@quarry/shared/domain'
import { LibraryExplorerApp } from '@/apps/library/components/LibraryExplorerApp'
import { APPS } from '@/shell/apps'
import { App } from '@/AppKit'
import { LibrarySDK } from '@/SDKs/LibrarySDK/sdk'
import { orNotFound } from '@/utils/loader'
import { libraryApp } from '../definition'

export const Route = createFileRoute('/_workspace/library/$rid')({
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
    // Entering opens the project or folder (others were redirected above): it and the audit
    // `open` in one request. A hover (preload) and a search change (stay) don't.
    loader: async ({ params, cause }) => {
        if (cause === 'enter')
            await orNotFound(LibrarySDK.actions.resource.open(params.rid, libraryApp.id))
    },
    // A preload is only a read: a click after a hover must still run the loader, to open.
    preloadStaleTime: 0,
    pendingComponent: App.Pending,
    pendingMs: 0,
    component: ResourceRoute,
})

function ResourceRoute() {
    const { rid } = Route.useParams()

    return <LibraryExplorerApp cwd={rid} tab='files' />
}
