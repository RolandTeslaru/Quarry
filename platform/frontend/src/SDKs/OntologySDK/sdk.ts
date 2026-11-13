import { createWithEqualityFn } from 'zustand/traditional'
import { immer } from 'zustand/middleware/immer'
import { shallow } from 'zustand/shallow'
import { SDK } from '@quarry/standard-ui/SDKs/SDKManager'
import { BaseSDK } from '../core/BaseSDK'
import { OntologyActions } from './actions'
import { _createOntologyDialogs_, type _OntologySDKDialogs } from './dialogs'

/** The ontology's types — object types and link types — as Ontology Studio shows them (query cache only, for now). */
@SDK('Ontology')
export class OntologySDKImpl extends BaseSDK<OntologySDK.State> {

    public readonly useStore: BaseSDK.Store<OntologySDK.State> = createWithEqualityFn(
        immer<OntologySDK.State>(() => ({})),
        shallow,
    )

    public readonly actions: OntologySDK.Actions = new OntologyActions(this)

    public readonly dialogs: OntologySDK.Dialogs = _createOntologyDialogs_()

    public override readonly query = {
        /** Every object type the user can read, by name. */
        objectTypes: {
            queryKey: ['ontology', 'objectTypes'] as const,
            queryFn: () => this.actions.getObjectTypes(),
            staleTime: 0,
        },
        /** Every link type the user can read, by name. */
        linkTypes: {
            queryKey: ['ontology', 'linkTypes'] as const,
            queryFn: () => this.actions.getLinkTypes(),
            staleTime: 0,
        },
    }

    /** Nothing of its own: types live in the query cache, cleared with it. */
    public override cleanup(): void {}
}

export const OntologySDK = SDK.get<OntologySDKImpl>('Ontology')

export namespace OntologySDK {

    export type State = Record<string, never>

    export type Actions = OntologyActions

    export type Dialogs = _OntologySDKDialogs
}
