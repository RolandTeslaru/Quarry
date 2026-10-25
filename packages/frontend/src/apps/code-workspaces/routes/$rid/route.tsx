import { useState } from 'react'
import { createFileRoute, Link, notFound, Outlet, useMatchRoute } from '@tanstack/react-router'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Menubar } from '@quarry/standard-ui/foundations/menubar'
import { Select } from '@quarry/standard-ui/foundations/select'
import { Tabs } from '@quarry/standard-ui/foundations/tabs'
import { cn } from '@quarry/standard-ui/utils/cn'
import { CodeWorkspace } from '@quarry/shared/domain'
import { App } from '@/AppKit'
import { CodeWorkspaceSDK } from '@/SDKs/CodeWorkspaceSDK/sdk'
import { IDESessionFrame } from '@/SDKs/CodeWorkspaceSDK/ui/IDESessionFrame'
import { ResourceBreadcrumbs } from '@/components/ResourceBreadcrumbs'
import { useTask } from '@/hooks/useTask'
import { orNotFound } from '@/utils/loader'
import { PreviewPanel, type PreviewRun } from '../../components/PreviewPanel'
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
    // Entering opens the workspace: it and the audit `open` in one request. A hover (preload) only reads.
    loader: async ({ params, cause }) => {
        if (cause === 'enter')
            await orNotFound(CodeWorkspaceSDK.actions.workspace.open(params.rid, codeWorkspacesApp.id))
        else if (cause === 'preload')
            await CodeWorkspaceSDK.prefetch(CodeWorkspaceSDK.query.workspace(params.rid))
    },
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
 * One Code Workspace — the layout around its tabs. The header and its tabs are
 * here; so is the user's session — VS Code in the browser — which stays
 * mounted on every tab and is only hidden away from Code, so the editor never
 * reloads. On Code: a transform of the working copy previewed on samples of its
 * inputs (picked in the header), the result under the editor. The other tabs
 * render into the outlet.
 */
function WorkspaceLayout({ rid }: WorkspaceLayoutProps) {
    const tab = useWorkspaceTab(rid)

    const [, [sessionRequest]] = CodeWorkspaceSDK.useWith(
        () => null,
        query => [query.session(rid)],
    )

    const [preview, setPreview] = useState<PreviewRun | null>(null)
    const [task, withTask] = useTask()

    const runPreview = withTask(async (transform: string) => {
        setPreview({ transform, result: null })

        try {
            const result = await CodeWorkspaceSDK.actions.session.preview(rid, transform)

            setPreview({ transform, result })
        }
        catch {
            setPreview(null)                                // the action told the user why
        }
    })

    const sessionUrl = sessionRequest.data?.url ?? null

    return (
        <>
            <App.Header>
                <App.Header.Icon glyph={codeWorkspacesApp.glyph} />
                <App.Header.Rows>
                    <ResourceBreadcrumbs rid={rid} />
                    <App.Header.Menubar>
                        <Menubar.Menu>
                            <Menubar.Trigger>File</Menubar.Trigger>
                            <Menubar.Content>
                                
                            </Menubar.Content>
                        </Menubar.Menu>
                        <Menubar.Menu>
                            <Menubar.Trigger>Help</Menubar.Trigger>
                            <Menubar.Content>
                                
                            </Menubar.Content>
                        </Menubar.Menu>
                    </App.Header.Menubar>
                </App.Header.Rows>

                <Tabs.Root value={tab} activationMode='manual' className='self-stretch'>
                    <Tabs.List variant='underline' className='h-full! px-4 border-l border-border'>
                        {Object.entries(WORKSPACE_TABS).map(([value, { label, to }]) => (
                            <Tabs.Trigger key={value} value={value} asChild>
                                <Link to={to} params={{ rid }}>{label}</Link>
                            </Tabs.Trigger>
                        ))}
                    </Tabs.List>
                </Tabs.Root>

                {tab === 'code' && (
                    <App.Header.Actions>
                        <PreviewControls
                            rid={rid}
                            ready={sessionUrl !== null}
                            running={task.pending}
                            onPreview={runPreview}
                        />
                        <Button icon='refresh' loading={sessionRequest.isFetching} onClick={() => void sessionRequest.refetch()}>
                            Reconnect
                        </Button>
                    </App.Header.Actions>
                )}
            </App.Header>

            <App.Content className='overflow-hidden'>
                <div className={cn('flex min-h-0 flex-1 flex-col', tab !== 'code' && 'hidden')}>
                    <div className='min-h-0 flex-1'>
                        <IDESessionFrame rid={rid} />
                    </div>

                    {preview && (
                        <PreviewPanel
                            run={preview}
                            onRerun={() => runPreview(preview.transform)}
                            onClose={() => setPreview(null)}
                        />
                    )}
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

interface PreviewControlsProps {
    rid:       CodeWorkspace.Rid
    /** The session is up — its working copy can be read. */
    ready:     boolean
    running:   boolean
    onPreview: (transform: string) => void
}

/**
 * The transforms the working copy declares, and Preview. Opening the list reads
 * it again, so a transform just written (and saved) is there.
 */
function PreviewControls({ rid, ready, running, onPreview }: PreviewControlsProps) {
    const [chosen, setChosen] = useState<string | null>(null)

    const [, [transformsRequest]] = CodeWorkspaceSDK.useWith(
        () => null,
        query => [{ ...query.transforms(rid), enabled: ready }],
    )

    const listing = transformsRequest.data
    const transforms = listing && 'transforms' in listing ? listing.transforms : []
    const byName = Object.fromEntries(transforms.map(transform => [transform.name, transform]))

    // The one chosen while it's still declared; else the first.
    const selected = chosen && byName[chosen] ? chosen : transforms[0]?.name ?? null

    function refreshOnOpen(open: boolean) {
        if (open)
            void transformsRequest.refetch()
    }

    return (
        <div className='flex items-center gap-1.5'>
            <Select.Root
                value={selected ?? ''}
                onValueChange={setChosen}
                onOpenChange={refreshOnOpen}
                disabled={!ready || transforms.length === 0}
            >
                <Select.Trigger size='sm' className='w-56' title={listingProblem(listing, transformsRequest.error) ?? undefined}>
                    <Select.Value placeholder={placeholder(ready, listing, transformsRequest.error)} />
                </Select.Trigger>
                <Select.Content>
                    {transforms.map(transform => (
                        <Select.Item key={transform.name} value={transform.name} description={transform.name}>
                            {functionName(transform.name)}
                        </Select.Item>
                    ))}
                </Select.Content>
            </Select.Root>

            <Button
                intent='primary'
                icon='play'
                loading={running}
                disabled={!selected}
                onClick={() => selected && onPreview(selected)}
            >
                Preview
            </Button>
        </div>
    )
}

/** What the picker says while there's nothing to pick. */
function placeholder(ready: boolean, listing: CodeWorkspace.Preview.Listing | undefined, error: Error | null): string {
    if (!ready)
        return 'Starting the session…'

    if (error || (listing && 'error' in listing))
        return 'The pipeline didn’t load'

    if (!listing)
        return 'Reading transforms…'

    return 'No transforms yet'
}

/** Why the transforms couldn't be listed — the picker's hover text. */
function listingProblem(listing: CodeWorkspace.Preview.Listing | undefined, error: Error | null): string | null {
    if (error)
        return error.message

    if (listing && 'error' in listing)
        return listing.error.message

    return null
}

/** `sales_cleaning.datasets.example.example` → `example` */
function functionName(name: string): string {
    return name.slice(name.lastIndexOf('.') + 1)
}
