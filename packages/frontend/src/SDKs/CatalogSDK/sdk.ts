import type { Catalog } from '@quarry/shared/domain'
import { createWithEqualityFn } from 'zustand/traditional'
import { immer } from 'zustand/middleware/immer'
import { shallow } from 'zustand/shallow'
import { BaseSDK } from '../core/BaseSDK'
import { _createCatalogActions_, type _CatalogSDKActions } from './actions'

/** A committed version never changes; only the latest view moves. */
const PAST_VIEW_STALE_TIME = Infinity
const LATEST_VIEW_STALE_TIME = 0

export class CatalogSDKImpl extends BaseSDK<CatalogSDK.State> {

    public readonly useStore: BaseSDK.Store<CatalogSDK.State> = createWithEqualityFn(
        immer<CatalogSDK.State>(() => ({
            datasets: {},
        })),
        shallow,
    )

    public readonly actions: CatalogSDK.Actions = _createCatalogActions_(this)

    // Views and previews are read-only results for one screen: they live in the query cache only.
    public override readonly query = {
        dataset: (rid: Catalog.Dataset.Rid) => ({
            queryKey: ['catalog', 'dataset', rid] as const,
            queryFn: () => this.actions.dataset.get(rid),
            staleTime: 0,
        }),

        view: (rid: Catalog.Dataset.Rid, sequence?: number) => ({
            queryKey: ['catalog', 'view', rid, sequence ?? 'latest'] as const,
            queryFn: () => this.actions.dataset.view(rid, sequence),
            staleTime: sequence === undefined ? LATEST_VIEW_STALE_TIME : PAST_VIEW_STALE_TIME,
        }),

        /** Every version's view of a dataset — the key prefix to invalidate after a write. */
        views: (rid: Catalog.Dataset.Rid) => ({
            queryKey: ['catalog', 'view', rid] as const,
        }),

        preview: (rid: Catalog.Dataset.Rid) => ({
            queryKey: ['catalog', 'preview', rid] as const,
            queryFn: () => this.actions.dataset.preview(rid),
            staleTime: 0,
        }),
    }

    public override cleanup(): void {
        this.setState({
            datasets: {},
        })
    }
}

export const CatalogSDK = new CatalogSDKImpl()

export namespace CatalogSDK {

    export type State = {
        datasets: Record<Catalog.Dataset.Rid, Catalog.Dataset.Schema>
    }

    export type Actions = _CatalogSDKActions
}
