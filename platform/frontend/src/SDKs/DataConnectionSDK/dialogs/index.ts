import { openCreateSourceDialog } from './source-dialogs'
import { openCreateSyncDialog } from './sync-dialogs'

export function _createDataConnectionDialogs_() {
    return {
        openCreateSource: openCreateSourceDialog,
        openCreateSync:   openCreateSyncDialog,
    }
}

export type _DataConnectionSDKDialogs = ReturnType<typeof _createDataConnectionDialogs_>
