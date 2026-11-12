import { type Dataset, Forge, Foundations } from '@quarry/shared/domain'
import { NotificationSDK } from '@quarry/standard-ui/SDKs/NotificationSDK'
import { api, describeError, errorMessage } from '@/SDKs/api'
import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import type { ForgeSDKImpl } from '../sdk'

/** `ForgeSDK.actions.build` */
export class BuildActions extends ActionGroup<ForgeSDKImpl> {

    protected readonly log = log.withContext('Forge.Actions.Build')

    public async list(): Promise<Forge.API.ListBuilds.Response> {
        const data = await Forge.API.listBuilds(api)

        this.sdk.setState({ builds: data.builds })

        return data
    }

    /** The builds of one dataset, newest first. */
    public async listForDataset(datasetRid: Dataset.Rid): Promise<Forge.API.ListBuilds.Response> {
        const data = await Forge.API.listBuilds(api, { datasetRid })

        this.sdk.setState(state => {
            state.datasetBuilds[datasetRid] = data.builds
        })

        return data
    }

    /** One build, and its jobs. */
    public async get(rid: Forge.Build.Rid): Promise<Forge.API.GetBuild.Response> {
        const data = await Forge.API.getBuild(api, rid)

        this.sdk.setState(state => {
            state.buildJobs[rid] = data.jobs
        })

        return data
    }

    /** Starts a build of the dataset on main: whatever its current recipe says — only if it's out of date, unless forced. */
    public async start(datasetRid: Dataset.Rid, forceBuild = false): Promise<Forge.Build> {
        try {
            const { build } = await Forge.API.createBuild(api, {
                branch:           Foundations.MAIN_BRANCH,
                fallbackBranches: [],
                target:           { type: 'manual', datasetRids: [datasetRid] },
                forceBuild,
            })

            await this.sdk.invalidate(this.sdk.query.datasetBuilds(datasetRid))

            return build
        }
        catch (error) {
            this.log.error('start failed', describeError(error))
            NotificationSDK.toast.error("Couldn't start the build", { description: errorMessage(error) })

            throw error
        }
    }
}
