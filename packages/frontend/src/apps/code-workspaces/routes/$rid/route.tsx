import { createFileRoute, Link, notFound, Outlet, useMatchRoute } from '@tanstack/react-router'
import { Menubar } from '@quarry/standard-ui/foundations/menubar'
import { Tabs } from '@quarry/standard-ui/foundations/tabs'
import { Icon } from '@quarry/standard-ui/icons'
import { cn } from '@quarry/standard-ui/utils/cn'
import { CodeWorkspace } from '@quarry/shared/domain'
import { App } from '@/AppKit'
import { CodeWorkspaceSDK } from '@/SDKs/CodeWorkspaceSDK/sdk'
import { IDESessionFrame } from '@/SDKs/CodeWorkspaceSDK/ui/IDESessionFrame'
import { ResourceBreadcrumbs } from '@/components/ResourceBreadcrumbs'
import { useTask } from '@/hooks/useTask'
import { orNotFound } from '@/utils/loader'
import { WORKSPACE_TABS, type WorkspaceTab } from '../../constants'
import { codeWorkspacesApp } from '../../definition'

export const Route = createFileRoute('/_workspace/code-workspaces/$rid')({
    params: {
        parse: params => {
            const parsed = CodeWorkspace.Rid.safeParse(params.rid)

            if (!parsed.success)
                throw notFound()

            return { rid: parsed.data }
        },
    },
    // Entering opens the workspace: it and the audit `open` in one request; then its check runs go live
    // until it closes (CodeWorkspaceSDK decides what open means). A hover (preload) only reads.
    loader: async ({ params, cause }) => {
        if (cause === 'enter')
            await orNotFound(CodeWorkspaceSDK.actions.workspace.open(params.rid, codeWorkspacesApp.id))
        else if (cause === 'preload')
            await CodeWorkspaceSDK.prefetch(CodeWorkspaceSDK.query.workspace(params.rid))
    },
    onLeave: match => CodeWorkspaceSDK.actions.workspace.close(match.params.rid),
    // A preload is only a read: a click after a hover must still run the loader, to open.
    preloadStaleTime: 0,
    pendingComponent: App.Pending,
    pendingMs: 0,
    component: WorkspaceRoute,
})

function WorkspaceRoute() {
    const { rid } = Route.useParams()

    return <WorkspaceLayout key={rid} rid={rid} />
}

interface WorkspaceLayoutProps {
    rid: CodeWorkspace.Rid
}

/**
 * One Code Workspace — the layout around its tabs. The navbar and its tabs are
 * here; so is the user's session — VS Code in the browser — which stays
 * mounted on every tab and is only hidden away from Code, so the editor never
 * reloads (previews run in it — the Quarry extension's ▶ Preview). The other
 * tabs render into the outlet. The IDE menu reconnects the session, or restarts
 * it on a fresh container (after a runtime image rebuild).
 */
function WorkspaceLayout({ rid }: WorkspaceLayoutProps) {
    const tab = useWorkspaceTab(rid)

    const [, [sessionRequest]] = CodeWorkspaceSDK.useWith(
        () => null,
        query => [query.session(rid)],
    )

    const [restart, withRestart] = useTask()

    const sessionBusy = sessionRequest.isFetching || restart.pending

    return (
        <>
            <App.Navbar>
                <App.Navbar.Icon glyph={codeWorkspacesApp.glyph} />
                <App.Navbar.Rows>
                    <ResourceBreadcrumbs rid={rid} />
                    <App.Navbar.Menubar>
                        <Menubar.Menu>
                            <Menubar.Trigger>File</Menubar.Trigger>
                            <Menubar.Content>
                                
                            </Menubar.Content>
                        </Menubar.Menu>
                        <Menubar.Menu>
                            <Menubar.Trigger>IDE</Menubar.Trigger>
                            <Menubar.Content>
                                {/* Starts the session again if it stopped, and reloads the editor with it. */}
                                <Menubar.Item disabled={sessionBusy} onSelect={() => void sessionRequest.refetch()}>
                                    <Icon name='refresh' />
                                    {sessionRequest.isFetching ? 'Reconnecting…' : 'Reconnect'}
                                </Menubar.Item>
                                {/* A fresh container from the current runtime image; the working copy stays. */}
                                <Menubar.Item
                                    disabled={sessionBusy}
                                    onSelect={withRestart(() => CodeWorkspaceSDK.actions.session.restart(rid))}
                                >
                                    <Icon name='power' />
                                    {restart.pending ? 'Restarting…' : 'Restart'}
                                </Menubar.Item>
                            </Menubar.Content>
                        </Menubar.Menu>
                        <Menubar.Menu>
                            <Menubar.Trigger>Help</Menubar.Trigger>
                            <Menubar.Content>
                                
                            </Menubar.Content>
                        </Menubar.Menu>
                    </App.Navbar.Menubar>
                </App.Navbar.Rows>

                <Tabs.Root value={tab} activationMode='manual' className='self-stretch'>
                    <Tabs.List variant='underline' className='h-full! px-4 border-l border-border'>
                        {Object.entries(WORKSPACE_TABS).map(([value, { label, to }]) => (
                            <Tabs.Trigger key={value} value={value} asChild>
                                <Link to={to} params={{ rid }}>{label}</Link>
                            </Tabs.Trigger>
                        ))}
                    </Tabs.List>
                </Tabs.Root>
            </App.Navbar>

            <App.Content className='overflow-hidden'>
                <div className={cn('min-h-0 flex-1', tab !== 'code' && 'hidden')}>
                    <IDESessionFrame rid={rid} restarting={restart.pending} />
                </div>

                <Outlet />
            </App.Content>
        </>
    )
}

/** Which tab's route is showing. */
function useWorkspaceTab(rid: CodeWorkspace.Rid): WorkspaceTab {
    const matchRoute = useMatchRoute()
    const tabs = Object.entries(WORKSPACE_TABS) as [WorkspaceTab, (typeof WORKSPACE_TABS)[WorkspaceTab]][]

    return tabs.find(([, { to }]) => matchRoute({ to, params: { rid } }))?.[0] ?? 'code'
}
