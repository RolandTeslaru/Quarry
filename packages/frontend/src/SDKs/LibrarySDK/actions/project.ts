import { Library } from '@quarry/shared/domain'
import { api } from '@/SDKs/api'
import { ActionGroup } from '@/SDKs/core/actions'
import { log } from '@/SDKs/core/log'
import type { LibrarySDKImpl } from '../sdk'

/** `LibrarySDK.actions.project` */
export class ProjectActions extends ActionGroup<LibrarySDKImpl> {

    protected readonly log = log.withContext('Library.Actions.Project')

    async list(): Promise<Library.API.Project.List.Response> {
        const data = await Library.API.Project.list(api)

        this.sdk.setState(state => {
            state.projects = data.projects.map(project => project.rid)

            for (const project of data.projects)
                state.resources[project.rid] = project
        })

        return data
    }

    async create(request: Library.API.Project.Create.Request): Promise<Library.Project.Schema> {
        const { project } = await Library.API.Project.create(api, request)

        await this.sdk.invalidate(this.sdk.query.projects)

        return project
    }
}
