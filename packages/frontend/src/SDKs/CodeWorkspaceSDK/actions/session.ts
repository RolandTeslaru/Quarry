import { CodeWorkspace } from '@quarry/shared/domain'
import { NotificationSDK } from '@quarry/standard-ui/SDKs/NotificationSDK'
import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import { api, describeError, errorMessage } from '@/SDKs/api'
import type { CodeWorkspaceSDKImpl } from '../sdk'

/** `CodeWorkspaceSDK.actions.session` — the user's session on a workspace: its IDE, its transforms, previews. */
export class SessionActions extends ActionGroup<CodeWorkspaceSDKImpl> {

    protected readonly log = log.withContext('CodeWorkspace.Actions.Session')

    /** Starts the session (or reuses it); the IDE's URL. Its page shows a failure in place. */
    public open(rid: CodeWorkspace.Rid): Promise<CodeWorkspace.API.OpenSession.Response> {
        return CodeWorkspace.API.openSession(api, rid)
    }

    public getTransforms(rid: CodeWorkspace.Rid): Promise<CodeWorkspace.API.ListTransforms.Response> {
        return CodeWorkspace.API.listTransforms(api, rid)
    }

    /**
     * Runs one transform of the working copy on samples of its inputs. A transform
     * that raised is a result (its traceback), not a failure; a failed request is.
     */
    public async preview(rid: CodeWorkspace.Rid, transform: string): Promise<CodeWorkspace.API.Preview.Response> {
        try {
            return await CodeWorkspace.API.preview(api, rid, { transform })
        }
        catch (error) {
            this.log.error('preview failed', describeError(error))
            NotificationSDK.toast.error("Couldn't run the preview", { description: errorMessage(error) })

            throw error
        }
    }
}
