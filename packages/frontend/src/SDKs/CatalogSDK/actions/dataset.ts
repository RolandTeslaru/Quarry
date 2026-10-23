import { Catalog, type Library } from '@quarry/shared/domain'
import { api } from '@/SDKs/api'
import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import { LibrarySDK } from '@/SDKs/LibrarySDK/sdk'
import type { CatalogSDKImpl } from '../sdk'

/** `CatalogSDK.actions.dataset` */
export class DatasetActions extends ActionGroup<CatalogSDKImpl> {

    protected readonly log = log.withContext('Catalog.Actions.Dataset')

    public list(): Promise<Catalog.API.Dataset.List.Response> {
        return Catalog.API.Dataset.list(api)
    }

    public async get(rid: Catalog.Dataset.Rid): Promise<Catalog.API.Dataset.Get.Response> {
        const data = await Catalog.API.Dataset.get(api, rid)

        this.sdk.setState(state => {
            state.datasets[rid] = data.dataset
        })

        return data
    }

    public view(rid: Catalog.Dataset.Rid, sequence?: number): Promise<Catalog.API.Dataset.GetView.Response> {
        return Catalog.API.Dataset.getView(api, rid, { sequence })
    }

    public preview(rid: Catalog.Dataset.Rid): Promise<Catalog.API.Dataset.Preview.Response> {
        return Catalog.API.Dataset.preview(api, rid)
    }

    public async createFromFile(parentRid: Library.Resource.Rid, file: File): Promise<Catalog.API.Dataset.Upload.Response> {
        const data = await Catalog.API.Dataset.createFromFile(api, { parentRid }, file, file.name)

        this.sdk.setState(state => {
            state.datasets[data.dataset.rid] = data.dataset
        })

        await LibrarySDK.invalidate(LibrarySDK.query.children(parentRid))

        return data
    }

    public async upload(
        rid:  Catalog.Dataset.Rid,
        mode: Catalog.API.Dataset.Upload.Fields['mode'],
        file: File,
    ): Promise<Catalog.API.Dataset.Upload.Response> {
        const data = await Catalog.API.Dataset.upload(api, rid, { mode }, file, file.name)

        this.sdk.setState(state => {
            state.datasets[rid] = data.dataset
        })

        await Promise.all([
            this.sdk.invalidate(this.sdk.query.dataset(rid)),
            this.sdk.invalidate(this.sdk.query.views(rid)),
            this.sdk.invalidate(this.sdk.query.preview(rid)),
        ])

        return data
    }
}
