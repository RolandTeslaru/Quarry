import { Ontology } from '@quarry/shared/domain'
import { NotificationSDK } from '@quarry/standard-ui/SDKs/NotificationSDK'
import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import { api, describeError, errorMessage } from '@/SDKs/api'
import { LibrarySDK } from '@/SDKs/LibrarySDK/sdk'
import type { OntologySDKImpl } from '../sdk'

/** `OntologySDK.actions` */
export class OntologyActions extends ActionGroup<OntologySDKImpl> {

    protected readonly log = log.withContext('Ontology.Actions')

    public async getObjectTypes(): Promise<Ontology.ObjectType[]> {
        const { objectTypes } = await Ontology.API.ObjectType.list(api)

        return objectTypes
    }

    public async getLinkTypes(): Promise<Ontology.LinkType[]> {
        const { linkTypes } = await Ontology.API.LinkType.list(api)

        return linkTypes
    }

    public async createObjectType(request: Ontology.API.ObjectType.Create.Request): Promise<Ontology.ObjectType> {
        try {
            const { objectType } = await Ontology.API.ObjectType.create(api, request)

            await Promise.all([
                this.sdk.invalidate(this.sdk.query.objectTypes),
                LibrarySDK.invalidate(LibrarySDK.query.children(request.parentRid)),
            ])

            return objectType
        }
        catch (error) {
            this.log.error('createObjectType failed', describeError(error))
            NotificationSDK.toast.error("Couldn't create object type", { description: errorMessage(error) })

            throw error
        }
    }

    public async createLinkType(request: Ontology.API.LinkType.Create.Request): Promise<Ontology.LinkType> {
        try {
            const { linkType } = await Ontology.API.LinkType.create(api, request)

            await Promise.all([
                this.sdk.invalidate(this.sdk.query.linkTypes),
                LibrarySDK.invalidate(LibrarySDK.query.children(request.parentRid)),
            ])

            return linkType
        }
        catch (error) {
            this.log.error('createLinkType failed', describeError(error))
            NotificationSDK.toast.error("Couldn't create link type", { description: errorMessage(error) })

            throw error
        }
    }
}
