import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Table } from '@quarry/standard-ui/foundations/table'
import { Tabs } from '@quarry/standard-ui/foundations/tabs'
import type { CodeWorkspace } from '@quarry/shared/domain'
import { App } from '@/AppKit'
import { AuditSDK } from '@/SDKs/AuditSDK/sdk'
import { CodeWorkspaceSDK } from '@/SDKs/CodeWorkspaceSDK/sdk'
import { ErrorNotice } from '@/components/ErrorNotice'
import { ResourceLink } from '@/components/ResourceLink'
import { dateTime } from '@/utils/format'

/** The home's tabs: Recent is the default; All workspaces lives in `?view=all`. */
type HomeView = 'recent' | 'all'

interface CodeWorkspacesSearch {
    view?: Exclude<HomeView, 'recent'>
}

export const Route = createFileRoute('/_workspace/code-workspaces/')({
    validateSearch: (search: Record<string, unknown>): CodeWorkspacesSearch =>
        search.view === 'all' ? { view: 'all' } : {},
    component: CodeWorkspacesHome,
})

/**
 * Code Workspaces' home: one workspaces table, two tabs — the ones you opened
 * recently, newest first, or every one you can see.
 */
function CodeWorkspacesHome() {
    const navigate = useNavigate()
    const view: HomeView = Route.useSearch().view ?? 'recent'

    const [templates, [workspacesRequest, templatesRequest]] = CodeWorkspaceSDK.useWith(
        state => state.templates,
        query => [query.workspaces, query.templates],
    )

    const [, [recentsRequest]] = AuditSDK.useWith(
        () => null,
        query => [{ ...query.recents('code-workspaces'), enabled: view === 'recent' }],
    )

    const all = workspacesRequest.data?.workspaces ?? []

    // Recents are library rows; the table needs the workspaces themselves (their template) — by rid.
    const workspaceByRid = Object.fromEntries(all.map(workspace => [workspace.rid, workspace]))

    const workspaces = view === 'all'
        ? all
        : (recentsRequest.data?.recents ?? []).flatMap(recent => workspaceByRid[recent.resource.rid] ?? [])

    // The open tab's list.
    const listRequest = view === 'all' ? workspacesRequest : recentsRequest
    const pending = listRequest.isPending || workspacesRequest.isPending
    const loaded = listRequest.isSuccess && workspacesRequest.isSuccess

    function openView(next: string) {
        void navigate({ to: '/code-workspaces', search: next === 'all' ? { view: 'all' } : {} })
    }

    function refresh() {
        void workspacesRequest.refetch()

        if (view === 'recent')
            void recentsRequest.refetch()
    }

    return (
        <App.Home.Root>
            <App.Home.Header>
                <App.Home.Logo />
                <App.Home.PreTitle />
                <App.Home.Title />
                <App.Home.TitleDescription />
            </App.Home.Header>

            <App.Home.Content>
                <Tabs.Root value={view} onValueChange={openView} className='gap-0'>
                    <App.Home.Toolbar>
                        <Tabs.List aria-label='Code Workspaces home'>
                            <Tabs.Trigger value='recent'>Recent</Tabs.Trigger>
                            <Tabs.Trigger value='all'>All workspaces</Tabs.Trigger>
                        </Tabs.List>
                        <Button
                            variant='minimal'
                            icon='refresh'
                            aria-label='Refresh'
                            loading={listRequest.isFetching || workspacesRequest.isFetching}
                            onClick={refresh}
                        />
                        <App.Home.Actions>
                            <Button intent='success' icon='add' onClick={() => CodeWorkspaceSDK.dialogs.openCreateWorkspace()}>
                                New workspace
                            </Button>
                        </App.Home.Actions>
                    </App.Home.Toolbar>

                    <div className='flex flex-col gap-3 px-6 py-5'>
                        <ErrorNotice error={listRequest.error ?? workspacesRequest.error ?? templatesRequest.error} />

                        {pending && <Spinner className='size-6' role='status' aria-label='Loading' />}

                        {loaded && workspaces.length === 0 && (
                            <p className='text-sm text-muted-foreground'>
                                {view === 'all' ? 'No workspaces yet. Create one with New workspace.' : 'Nothing opened yet. Workspaces you open show up here.'}
                            </p>
                        )}

                        {workspaces.length > 0 && <WorkspacesTable workspaces={workspaces} templates={templates} />}
                    </div>
                </Tabs.Root>
            </App.Home.Content>
        </App.Home.Root>
    )
}

interface WorkspacesTableProps {
    workspaces: CodeWorkspace.Schema[]
    templates:  CodeWorkspaceSDK.State['templates']
}

/** Workspaces, with their template and when they last changed — the same table for both tabs. */
function WorkspacesTable({ workspaces, templates }: WorkspacesTableProps) {
    return (
        <Table.Root>
            <Table.Header>
                <Table.Row>
                    <Table.Head>Name</Table.Head>
                    <Table.Head>Template</Table.Head>
                    <Table.Head>Last updated</Table.Head>
                </Table.Row>
            </Table.Header>
            <Table.Body>
                {workspaces.map(workspace => (
                    <Table.Row key={workspace.rid}>
                        <Table.Cell>
                            <ResourceLink resource={workspace} />
                        </Table.Cell>
                        <Table.Cell>{templates[workspace.templateId]?.displayName ?? workspace.templateId}</Table.Cell>
                        <Table.Cell>{dateTime(workspace.updatedAt)}</Table.Cell>
                    </Table.Row>
                ))}
            </Table.Body>
        </Table.Root>
    )
}
