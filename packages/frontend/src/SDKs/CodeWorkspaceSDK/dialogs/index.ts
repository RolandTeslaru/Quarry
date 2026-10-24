import { openCreateWorkspaceDialog } from './workspace-dialogs'

export function _createCodeWorkspaceDialogs_() {
    return {
        openCreateWorkspace: openCreateWorkspaceDialog,
    }
}

export type _CodeWorkspaceSDKDialogs = ReturnType<typeof _createCodeWorkspaceDialogs_>
