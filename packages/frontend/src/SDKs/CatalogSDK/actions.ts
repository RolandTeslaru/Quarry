import { Catalog } from '@quarry/shared/domain'
import { api } from '../api'
import { viewKey } from './selectors'
import type { CatalogSDKImpl } from './sdk'

export type _CatalogSDKActions = {
    dataset: {
        get: (rid: Catalog.Dataset.Rid) => Promise<Catalog.API.Dataset.Get.Response>
        view: (
            rid: Catalog.Dataset.Rid,
            sequence?: number,
        ) => Promise<Catalog.API.Dataset.GetView.Response>
    }
}

export function _createCatalogActions_(sdk: CatalogSDKImpl): _CatalogSDKActions {
    const setState = sdk.useStore.setState

    return {
        dataset: {
            get: async rid => {
                const data = await Catalog.API.Dataset.get(api, rid)

                setState(state => {
                    state.datasets[rid] = data.dataset
                })

                return data
            },

            view: async (rid, sequence) => {
                const data = await Catalog.API.Dataset.getView(api, rid, { sequence })

                setState(state => {
                    state.views[viewKey(rid, sequence)] = data.view
                })

                return data
            },
        },
    }
}
