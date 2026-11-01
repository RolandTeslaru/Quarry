import type { Catalog, Dataset } from '@quarry/shared/domain'
import { createWithEqualityFn } from 'zustand/traditional'
import { immer } from 'zustand/middleware/immer'
import { shallow } from 'zustand/shallow'
import { BaseSDK } from '../core/BaseSDK'
import { CatalogActions } from './actions'
import { _createCatalogDialogs_, type _CatalogSDKDialogs } from './dialogs'
import { SDK } from '@quarry/standard-ui/SDKs/SDKManager'

/** A committed version never changes; only the latest view moves. */
const PAST_VIEW_STALE_TIME = Infinity
const LATEST_VIEW_STALE_TIME = 0

@SDK('Catalog')
export class CatalogSDKImpl extends BaseSDK<CatalogSDK.State> {

    public readonly useStore: BaseSDK.Store<CatalogSDK.State> = createWithEqualityFn(
        immer<CatalogSDK.State>(() => ({
            datasets: {},
        })),
        shallow,
    )

    public readonly actions: CatalogSDK.Actions = new CatalogActions(this)

    public readonly dialogs: CatalogSDK.Dialogs = _createCatalogDialogs_()

    // Lists, views and previews are read-only results for one screen: they live in the query cache only.
    public override readonly query = {
        /** Every dataset the user can see — the dataset app's home. */
        datasets: {
            queryKey: ['catalog', 'datasets'] as const,
            queryFn: () => this.actions.dataset.list(),
            staleTime: 0,
        },

        dataset: (rid: Dataset.Rid) => ({
            queryKey: ['catalog', 'dataset', rid] as const,
            queryFn: () => this.actions.dataset.get(rid),
            staleTime: 0,
        }),

        view: (rid: Dataset.Rid, sequence?: Dataset.Sequence) => ({
            queryKey: ['catalog', 'view', rid, sequence ?? 'latest'] as const,
            queryFn: () => this.actions.dataset.view(rid, sequence),
            staleTime: sequence === undefined ? LATEST_VIEW_STALE_TIME : PAST_VIEW_STALE_TIME,
        }),

        /** Every version's view of a dataset — the key prefix to invalidate after a write. */
        views: (rid: Dataset.Rid) => ({
            queryKey: ['catalog', 'view', rid] as const,
        }),

        preview: (rid: Dataset.Rid) => ({
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

export const CatalogSDK = SDK.get<CatalogSDKImpl>('Catalog')

export namespace CatalogSDK {

    export type State = {
        datasets: Record<Dataset.Rid, Dataset.Schema>
    }

    export type Actions = CatalogActions
    export type Dialogs = _CatalogSDKDialogs
}
