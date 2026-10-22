import { Catalog, type Library } from '@quarry/shared/domain'
import { api } from '../api'
import { LibrarySDK } from '../LibrarySDK/sdk'
import type { CatalogSDKImpl } from './sdk'

export type _CatalogSDKActions = {
    dataset: {
        list: () => Promise<Catalog.API.Dataset.List.Response>
        get: (rid: Catalog.Dataset.Rid) => Promise<Catalog.API.Dataset.Get.Response>
        view: (
            rid: Catalog.Dataset.Rid,
            sequence?: number,
        ) => Promise<Catalog.API.Dataset.GetView.Response>
        preview: (rid: Catalog.Dataset.Rid) => Promise<Catalog.API.Dataset.Preview.Response>
        createFromFile: (
            parentRid: Library.Resource.Rid,
            file: File,
        ) => Promise<Catalog.API.Dataset.Upload.Response>
        upload: (
            rid: Catalog.Dataset.Rid,
            mode: Catalog.API.Dataset.Upload.Fields['mode'],
            file: File,
        ) => Promise<Catalog.API.Dataset.Upload.Response>
    }
}

export function _createCatalogActions_(sdk: CatalogSDKImpl): _CatalogSDKActions {
    const setState = sdk.useStore.setState

    return {
        dataset: {
            list: () =>
                Catalog.API.Dataset.list(api),

            get: async rid => {
                const data = await Catalog.API.Dataset.get(api, rid)

                setState(state => {
                    state.datasets[rid] = data.dataset
                })

                return data
            },

            view: (rid, sequence) =>
                Catalog.API.Dataset.getView(api, rid, { sequence }),

            preview: rid =>
                Catalog.API.Dataset.preview(api, rid),

            createFromFile: async (parentRid, file) => {
                const data = await Catalog.API.Dataset.createFromFile(api, { parentRid }, file, file.name)

                setState(state => {
                    state.datasets[data.dataset.rid] = data.dataset
                })

                await LibrarySDK.invalidate(LibrarySDK.query.children(parentRid))

                return data
            },

            upload: async (rid, mode, file) => {
                const data = await Catalog.API.Dataset.upload(api, rid, { mode }, file, file.name)

                setState(state => {
                    state.datasets[rid] = data.dataset
                })

                await Promise.all([
                    sdk.invalidate(sdk.query.dataset(rid)),
                    sdk.invalidate(sdk.query.views(rid)),
                    sdk.invalidate(sdk.query.preview(rid)),
                ])

                return data
            },
        },
    }
}
