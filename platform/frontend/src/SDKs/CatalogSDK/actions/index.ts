import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import type { CatalogSDKImpl } from '../sdk'
import { DatasetActions } from './dataset'

/** `CatalogSDK.actions`: its groups, by what they act on. */
export class CatalogActions extends ActionGroup<CatalogSDKImpl> {

    protected readonly log = log.withContext('Catalog.Actions')

    public readonly dataset = new DatasetActions(this.sdk)
}
