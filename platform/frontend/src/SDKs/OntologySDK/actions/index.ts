import { Ontology } from '@quarry/shared/domain'
import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import { api } from '@/SDKs/api'
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
}
