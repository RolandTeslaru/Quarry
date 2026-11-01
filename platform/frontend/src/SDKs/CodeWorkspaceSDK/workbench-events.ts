import { CodeWorkspace, Library } from '@quarry/shared/domain'
import { NotificationSDK } from '@quarry/standard-ui/SDKs/NotificationSDK'
import { log as sdkLog } from '@quarry/standard-ui/SDKs/core'
import { describeError, errorMessage } from '@/SDKs/api'
import { LibrarySDK } from '@/SDKs/LibrarySDK/sdk'

import Workbench = CodeWorkspace.Workbench

const log = sdkLog.withContext('CodeWorkspace.WorkbenchEvents')

/**
 * One question from the session's workbench (docs/design/code-workspaces/workbench-bridge.md), by its
 * command: what to answer. `actions.workbench.connect` receives them and posts the answers back.
 */
export function handleWorkbenchEvent(ask: Workbench.Ask): Promise<Workbench.Answer['result']> {
    switch (ask.command) {
        // The Library selector: the chosen resource and its path, or null if it closed without one.
        case Workbench.Command.PickResource.COMMAND:
            return new Promise(resolve => {
                // Choosing closes the dialog too: its close must not answer before the choice's path is in.
                let chosen = false

                LibrarySDK.dialogs.openLibrarySelector({
                    accept:   ask.args.accept,
                    onSelect: async resource => {
                        chosen = true

                        try {
                            const { path } = await LibrarySDK.actions.resource.getPath(resource.rid)

                            resolve({ rid: resource.rid, path: Library.Resource.getPath(path) })
                        }
                        catch (error) {
                            log.error('path failed', describeError(error))
                            NotificationSDK.toast.error("Couldn't send the dataset to the editor", { description: errorMessage(error) })
                            resolve(null)
                        }
                    },
                    onClose: () => {
                        if (!chosen)
                            resolve(null)
                    },
                })
            })
    }
}
