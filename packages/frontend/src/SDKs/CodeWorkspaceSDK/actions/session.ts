import { CodeWorkspace } from '@quarry/shared/domain'
import { ActionGroup, log } from '@quarry/standard-ui/SDKs/core'
import { api } from '@/SDKs/api'
import type { CodeWorkspaceSDKImpl } from '../sdk'

/** `CodeWorkspaceSDK.actions.session` — the user's session on a workspace: its IDE. */
export class SessionActions extends ActionGroup<CodeWorkspaceSDKImpl> {

    protected readonly log = log.withContext('CodeWorkspace.Actions.Session')

    /** Starts the session (or reuses it); the IDE's URL. Its page shows a failure in place. */
    public open(rid: CodeWorkspace.Rid): Promise<CodeWorkspace.API.OpenSession.Response> {
        return CodeWorkspace.API.openSession(api, rid)
    }
}
