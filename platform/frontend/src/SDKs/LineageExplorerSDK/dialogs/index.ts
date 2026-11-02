import { openCreateExplorationDialog } from './exploration-dialogs'

export function _createLineageExplorerDialogs_() {
    return {
        openCreateExploration: openCreateExplorationDialog,
    }
}

export type _LineageExplorerSDKDialogs = ReturnType<typeof _createLineageExplorerDialogs_>
