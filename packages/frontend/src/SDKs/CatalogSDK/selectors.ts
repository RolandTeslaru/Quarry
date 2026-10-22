import type { Catalog } from '@quarry/shared/domain'
import type { CatalogSDK } from './sdk'

export const viewKey = (rid: Catalog.Dataset.Rid, sequence?: number): string =>
    `${rid}:${sequence ?? 'latest'}`

export const _catalogSelectors_ = {
    view: (
        state: CatalogSDK.State,
        rid: Catalog.Dataset.Rid,
        sequence?: number,
    ): Catalog.Dataset.View.Schema | undefined =>
        state.views[viewKey(rid, sequence)],
}

export type _CatalogSDKSelectors = typeof _catalogSelectors_
