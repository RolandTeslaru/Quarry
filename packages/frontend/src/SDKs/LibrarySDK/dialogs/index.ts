import { openCreateFolderDialog } from './folder-dialogs'
import { openCreateProjectDialog } from './project-dialogs'

export function _createLibraryDialogs_() {
    return {
        openCreateProject: openCreateProjectDialog,
        openCreateFolder:  openCreateFolderDialog,
    }
}

export type _LibrarySDKDialogs = ReturnType<typeof _createLibraryDialogs_>
