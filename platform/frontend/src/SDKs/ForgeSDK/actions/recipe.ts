import { type Dataset, Forge, Foundations } from '@quarry/shared/domain'
import { api } from '@/SDKs/api'
import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import type { ForgeSDKImpl } from '../sdk'

/** `ForgeSDK.actions.recipe` — read-only and per screen, so the query cache holds the results. */
export class RecipeActions extends ActionGroup<ForgeSDKImpl> {

    protected readonly log = log.withContext('Forge.Actions.Recipe')

    /** What computes the dataset on the branch; null if nothing does — a raw dataset. */
    public async getCurrent(datasetRid: Dataset.Rid, branch: Foundations.Branch = Foundations.MAIN_BRANCH): Promise<Forge.API.GetCurrentRecipe.Response> {
        return Forge.API.getCurrentRecipe(api, { datasetRid, branch })
    }
}
