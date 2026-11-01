import { CodeWorkspace } from '@quarry/shared/domain'
import { createWithEqualityFn } from 'zustand/traditional'
import { immer } from 'zustand/middleware/immer'
import { shallow } from 'zustand/shallow'
import { BaseSDK } from '../core/BaseSDK'
import { CodeWorkspaceActions } from './actions'
import { _createCodeWorkspaceDialogs_, type _CodeWorkspaceSDKDialogs } from './dialogs'
import { SDK } from '@quarry/standard-ui/SDKs/SDKManager'
import { observeCodeWorkspace, type CodeWorkspaceObserver, type ObserveOptions as ObserveOptions_ } from './observe'

import CI = CodeWorkspace.CI

const TEMPLATES_STALE_TIME = Infinity

/** A session's URL holds while it runs; reopening is the page's own `refetch`. */
const SESSION_STALE_TIME = Infinity

@SDK('CodeWorkspace')
export class CodeWorkspaceSDKImpl extends BaseSDK<CodeWorkspaceSDK.State> {

    constructor() {
        super()

        // While a workspace is open, its check runs stay live: follow its channel from onOpen to onClose.
        this.observe({
            workspace: {
                onOpen:  workspaceRid => {
                    this.runtime.stopFollowing = this.actions.checkRun.follow(workspaceRid)
                },
                onClose: () => {
                    this.runtime.stopFollowing?.()
                    this.runtime.stopFollowing = null
                },
            },
        }, { immediate: true })
    }

    public readonly runtime = {
        /** Ends following the open workspace's check runs. */
        stopFollowing: null as (() => void) | null,
        /** The IDE's iframe the page is connected to (`actions.workbench.connect`), and the commands it's executing for the page. */
        workbench: null as {
            frame:     HTMLIFrameElement
            origin:    string
            executing: Record<string, (executed: CodeWorkspace.Workbench.Executed) => void>
        } | null,
    }

    public readonly useStore: BaseSDK.Store<CodeWorkspaceSDK.State> = createWithEqualityFn(
        immer<CodeWorkspaceSDK.State>(() => ({
            templates: {},
            workspaces: {},
            checkRuns: {},
            checkRunHistory: {},
            openWorkspaceRid: null,
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
        /** The workspace's newest check runs — the Checks tab; older pages through `actions.checkRun.loadOlder`. */
        checkRuns: (rid: CodeWorkspace.Rid) => ({
            queryKey: ['code-workspace', 'check-runs', rid] as const,
            queryFn: () => this.actions.checkRun.list(rid),
        }),

        session: (rid: CodeWorkspace.Rid) => ({
            queryKey: ['code-workspace', 'session', rid] as const,
            queryFn: () => this.actions.session.open(rid),
            staleTime: SESSION_STALE_TIME,
            refetchOnWindowFocus: false,
            retry: false,
        }),
    }

    public observe(observer: CodeWorkspaceSDK.Observer, options?: CodeWorkspaceSDK.ObserveOptions): () => void {
        return observeCodeWorkspace(this, observer, options)
    }

    public override cleanup(): void {
        this.setState({
            templates: {},
            workspaces: {},
            checkRuns: {},
            checkRunHistory: {},
            openWorkspaceRid: null,
        })
    }
}

export const CodeWorkspaceSDK = SDK.get<CodeWorkspaceSDKImpl>('CodeWorkspace')

export namespace CodeWorkspaceSDK {

    export type State = {
        templates:  Record<CodeWorkspace.Template.Id, CodeWorkspace.Template.Schema>
        workspaces: Record<CodeWorkspace.Rid, CodeWorkspace.Schema>
        checkRuns:  Record<CI.CheckRun.Rid, CI.CheckRun.Schema>
        /** Each workspace's loaded check runs, newest first (order matters: a list), and the next page's cursor. */
        checkRunHistory: Record<CodeWorkspace.Rid, { rids: CI.CheckRun.Rid[]; nextBefore: CI.CheckRun.Rid | null }>
        /** The workspace whose page is open (the route sets it); its check runs are followed live. */
        openWorkspaceRid: CodeWorkspace.Rid | null
    }

    export type Actions = CodeWorkspaceActions
    export type Observer = CodeWorkspaceObserver
    export type ObserveOptions = ObserveOptions_
    export type Dialogs = _CodeWorkspaceSDKDialogs
}
