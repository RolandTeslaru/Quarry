import { ActionGroup } from '@/SDKs/core/actions'
import { log } from '@/SDKs/core/log'
import type { CatalogSDKImpl } from '../sdk'
import { DatasetActions } from './dataset'

/** `CatalogSDK.actions`: its groups, by what they act on. */
export class CatalogActions extends ActionGroup<CatalogSDKImpl> {

    protected readonly log = log.withContext('Catalog.Actions')

    readonly dataset = new DatasetActions(this.sdk)
}
