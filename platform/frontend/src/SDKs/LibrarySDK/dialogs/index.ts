import { openCreateFolderDialog } from './folder-dialogs'
import { openCreateProjectDialog } from './project-dialogs'
import { openLibrarySelectorDialog } from './library-selector-dialog'
import { openRenameResourceDialog, openTrashResourceDialog } from './resource-dialogs'

export function _createLibraryDialogs_() {
    return {
        openCreateProject:   openCreateProjectDialog,
        openCreateFolder:    openCreateFolderDialog,
        openLibrarySelector: openLibrarySelectorDialog,
        openRenameResource:  openRenameResourceDialog,
        openTrashResource:   openTrashResourceDialog,
    }
}

export type _LibrarySDKDialogs = ReturnType<typeof _createLibraryDialogs_>
