import { openCreateFolderDialog } from './folder-dialogs'
import { openCreateProjectDialog } from './project-dialogs'
import { openLibrarySelectorDialog } from './library-selector-dialog'

export function _createLibraryDialogs_() {
    return {
        openCreateProject:   openCreateProjectDialog,
        openCreateFolder:    openCreateFolderDialog,
        openLibrarySelector: openLibrarySelectorDialog,
    }
}

export type _LibrarySDKDialogs = ReturnType<typeof _createLibraryDialogs_>
