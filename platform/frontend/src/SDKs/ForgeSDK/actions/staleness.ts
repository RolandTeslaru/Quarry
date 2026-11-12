import { type Dataset, Forge, Foundations } from '@quarry/shared/domain'
import { api } from '@/SDKs/api'
import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import type { ForgeSDKImpl } from '../sdk'

/** `ForgeSDK.actions.staleness` — read-only and per screen, so the query cache holds the results. */
export class StalenessActions extends ActionGroup<ForgeSDKImpl> {

    protected readonly log = log.withContext('Forge.Actions.Staleness')

    /** Each dataset's staleness on the branch: its own reasons, and how far up its nearest stale dataset is. */
    public async get(datasetRids: Dataset.Rid[], branch: Foundations.Branch = Foundations.MAIN_BRANCH): Promise<Forge.API.GetStaleness.Response> {
        return Forge.API.getStaleness(api, { datasetRids, branch })
    }
}
