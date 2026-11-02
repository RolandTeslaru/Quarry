import type { Dataset, Forge } from '@quarry/shared/domain'
import { createWithEqualityFn } from 'zustand/traditional'
import { immer } from 'zustand/middleware/immer'
import { shallow } from 'zustand/shallow'
import { BaseSDK } from '../core/BaseSDK'
import { ForgeActions } from './actions'
import { SDK } from '@quarry/standard-ui/SDKs/SDKManager'

/** How often a dataset's builds are checked while they're on screen: a build's own events are per build. */
const DATASET_BUILDS_REFRESH_MS = 3_000

@SDK('Forge')
export class ForgeSDKImpl extends BaseSDK<ForgeSDK.State> {

    public readonly useStore: BaseSDK.Store<ForgeSDK.State> = createWithEqualityFn(
        immer<ForgeSDK.State>(() => ({
            builds: [],
            datasetBuilds: {},
            buildJobs: {},
        })),
        shallow,
    )

    public readonly actions: ForgeSDK.Actions = new ForgeActions(this)

    public override readonly query = {
        builds: {
            queryKey: ['forge', 'builds'] as const,
            queryFn: () => this.actions.build.list(),
        },

        datasetBuilds: (datasetRid: Dataset.Rid) => ({
            queryKey: ['forge', 'builds', datasetRid] as const,
            queryFn: () => this.actions.build.listForDataset(datasetRid),
            refetchInterval: DATASET_BUILDS_REFRESH_MS,
        }),

        build: (rid: Forge.Build.Rid) => ({
            queryKey: ['forge', 'build', rid] as const,
            queryFn: () => this.actions.build.get(rid),
        }),
    }

    public override cleanup(): void {
        this.setState({
            builds: [],
            datasetBuilds: {},
            buildJobs: {},
        })
    }
}

export const ForgeSDK = SDK.get<ForgeSDKImpl>('Forge')

export namespace ForgeSDK {

    export type State = {
        /** Newest first. */
        builds: Forge.Build[]
        /** Each dataset's builds, newest first. */
        datasetBuilds: Record<Dataset.Rid, Forge.Build[]>
        buildJobs: Record<Forge.Build.Rid, Record<Forge.Job.Rid, Forge.Job>>
    }

    export type Actions = ForgeActions
}
