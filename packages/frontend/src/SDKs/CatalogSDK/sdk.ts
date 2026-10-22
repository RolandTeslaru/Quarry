import type { Catalog } from '@quarry/shared/domain'
import { createWithEqualityFn } from 'zustand/traditional'
import { immer } from 'zustand/middleware/immer'
import { shallow } from 'zustand/shallow'
import { BaseSDK } from '../core/BaseSDK'
import { _createCatalogActions_, type _CatalogSDKActions } from './actions'
import { _catalogSelectors_, type _CatalogSDKSelectors } from './selectors'

export class CatalogSDKImpl extends BaseSDK<CatalogSDK.State> {

    public readonly useStore: BaseSDK.Store<CatalogSDK.State> = createWithEqualityFn(
        immer<CatalogSDK.State>(() => ({
            datasets: {},
            views: {},
        })),
        shallow,
    )

    public readonly actions: CatalogSDK.Actions = _createCatalogActions_(this)

    public readonly selectors: CatalogSDK.Selectors = _catalogSelectors_

    public override readonly query = {
        dataset: (rid: Catalog.Dataset.Rid) => ({
            queryKey: ['catalog', 'dataset', rid] as const,
            queryFn: () => this.actions.dataset.get(rid),
            staleTime: 0,
        }),

        view: (rid: Catalog.Dataset.Rid, sequence?: number) => ({
            queryKey: ['catalog', 'view', rid, sequence ?? 'latest'] as const,
            queryFn: () => this.actions.dataset.view(rid, sequence),
            staleTime: 0,
        }),
    }

    public override cleanup(): void {
        this.setState({
            datasets: {},
            views: {},
        })
    }
}

export const CatalogSDK = new CatalogSDKImpl()

export namespace CatalogSDK {

    export type State = {
        datasets: Record<Catalog.Dataset.Rid, Catalog.Dataset.Schema>
        views:    Record<string, Catalog.Dataset.View.Schema>
    }

    export type Actions   = _CatalogSDKActions
    export type Selectors = _CatalogSDKSelectors
}
