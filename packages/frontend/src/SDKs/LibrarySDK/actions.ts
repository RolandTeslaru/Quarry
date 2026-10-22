import { Library } from '@quarry/shared/domain'
import { api } from '../api'
import type { LibrarySDKImpl } from './sdk'

export type _LibrarySDKActions = {
    project: {
        list:   () => Promise<Library.API.Project.List.Response>
        create: (request: Library.API.Project.Create.Request) => Promise<Library.Project.Schema>
    }
    folder: {
        create: (request: Library.API.Folder.Create.Request) => Promise<Library.Folder.Schema>
    }
    resource: {
        children: (rid: Library.Resource.Rid) => Promise<Library.API.Resource.Children.Response>
        path:     (rid: Library.Resource.Rid) => Promise<Library.API.Resource.Path.Response>
    }
}

export function _createLibraryActions_(sdk: LibrarySDKImpl): _LibrarySDKActions {
    const setState = sdk.useStore.setState

    return {
        project: {
            list: async () => {
                const data = await Library.API.Project.list(api)

                setState(state => {
                    state.projects = data.projects.map(project => project.rid)

                    for (const project of data.projects)
                        state.resources[project.rid] = project
                })

                return data
            },

            create: async request => {
                const { project } = await Library.API.Project.create(api, request)

                await sdk.invalidate(sdk.query.projects)

                return project
            },
        },

        folder: {
            create: async request => {
                const { folder } = await Library.API.Folder.create(api, request)

                await sdk.invalidate(sdk.query.children(request.parentRid))

                return folder
            },
        },

        resource: {
            children: async rid => {
                const data = await Library.API.Resource.children(api, rid)

                setState(state => {
                    state.children[rid] = data.children.map(resource => resource.rid)

                    for (const resource of data.children)
                        state.resources[resource.rid] = resource
                })

                return data
            },

            path: async rid => {
                const data = await Library.API.Resource.path(api, rid)

                setState(state => {
                    state.paths[rid] = data.path.map(resource => resource.rid)

                    for (const resource of data.path)
                        state.resources[resource.rid] = resource
                })

                return data
            },
        },
    }
}
