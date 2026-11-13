import { openCreateLinkTypeDialog } from './link-type-dialogs'
import { openCreateObjectTypeDialog } from './object-type-dialogs'

export function _createOntologyDialogs_() {
    return {
        openCreateObjectType: openCreateObjectTypeDialog,
        openCreateLinkType:   openCreateLinkTypeDialog,
    }
}

export type _OntologySDKDialogs = ReturnType<typeof _createOntologyDialogs_>
