import type { CodeWorkspace } from '@quarry/shared/domain'
import { createWithEqualityFn } from 'zustand/traditional'
import { immer } from 'zustand/middleware/immer'
import { shallow } from 'zustand/shallow'
import { BaseSDK } from '../core/BaseSDK'
import { CodeWorkspaceActions } from './actions'
import { _createCodeWorkspaceDialogs_, type _CodeWorkspaceSDKDialogs } from './dialogs'
import { SDK } from '@quarry/standard-ui/SDKs/SDKManager'

const TEMPLATES_STALE_TIME = Infinity

/** A session's URL holds while it runs; reopening is the page's own `refetch`. */
const SESSION_STALE_TIME = Infinity

@SDK('CodeWorkspace')
export class CodeWorkspaceSDKImpl extends BaseSDK<CodeWorkspaceSDK.State> {

    public readonly useStore: BaseSDK.Store<CodeWorkspaceSDK.State> = createWithEqualityFn(
        immer<CodeWorkspaceSDK.State>(() => ({
            templates: {},
            workspaces: {},
        })),
        shallow,
    )

    public readonly actions: CodeWorkspaceSDK.Actions = new CodeWorkspaceActions(this)

    public readonly dialogs: CodeWorkspaceSDK.Dialogs = _createCodeWorkspaceDialogs_()

    // Sessions are one screen's: query cache only.
    public override readonly query = {
        templates: {
            queryKey: ['code-workspace', 'templates'] as const,
            queryFn: () => this.actions.workspace.getTemplates(),
            staleTime: TEMPLATES_STALE_TIME,
        },

        /** Every workspace the user can see — the app's home. */
        workspaces: {
            queryKey: ['code-workspace', 'workspaces'] as const,
            queryFn: () => this.actions.workspace.list(),
            staleTime: 0,
        },

        workspace: (rid: CodeWorkspace.Rid) => ({
            queryKey: ['code-workspace', 'workspace', rid] as const,
            queryFn: () => this.actions.workspace.get(rid),
        }),

        /** The user's session on the workspace: started (or reused) by the code worker. */
        session: (rid: CodeWorkspace.Rid) => ({
            queryKey: ['code-workspace', 'session', rid] as const,
            queryFn: () => this.actions.session.open(rid),
            staleTime: SESSION_STALE_TIME,
            refetchOnWindowFocus: false,
            retry: false,
        }),
    }

    public override cleanup(): void {
        this.setState({
            templates: {},
            workspaces: {},
        })
    }
}

export const CodeWorkspaceSDK = SDK.get<CodeWorkspaceSDKImpl>('CodeWorkspace')

export namespace CodeWorkspaceSDK {

    export type State = {
        templates:  Record<CodeWorkspace.Template.Id, CodeWorkspace.Template.Schema>
        workspaces: Record<CodeWorkspace.Rid, CodeWorkspace.Schema>
    }

    export type Actions = CodeWorkspaceActions
    export type Dialogs = _CodeWorkspaceSDKDialogs
}
