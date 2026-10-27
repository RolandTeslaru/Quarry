import { CodeWorkspace } from '@quarry/shared/domain'
import { NotificationSDK } from '@quarry/standard-ui/SDKs/NotificationSDK'
import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import { api, describeError, errorMessage } from '@/SDKs/api'
import type { CodeWorkspaceSDKImpl } from '../sdk'

/** `CodeWorkspaceSDK.actions.session` — the user's session on a workspace: its IDE. */
export class SessionActions extends ActionGroup<CodeWorkspaceSDKImpl> {

    protected readonly log = log.withContext('CodeWorkspace.Actions.Session')

    /** Starts the session (or reuses it); the IDE's URL. Its page shows a failure in place. */
    public open(rid: CodeWorkspace.Rid): Promise<CodeWorkspace.API.OpenSession.Response> {
        return CodeWorkspace.API.openSession(api, rid)
    }

    /**
     * Replaces the session with a fresh container from the current runtime image — the working copy
     * stays. The session query takes the new URL, so the editor reloads with it.
     */
    public async restart(rid: CodeWorkspace.Rid): Promise<CodeWorkspace.API.RestartSession.Response> {
        try {
            const data = await CodeWorkspace.API.restartSession(api, rid)

            this.sdk.seedQuery(query => query.session(rid), data)

            return data
        }
        catch (error) {
            this.log.error('restart failed', describeError(error))
            NotificationSDK.toast.error("Couldn't restart the session", { description: errorMessage(error) })

            throw error
        }
    }
}
