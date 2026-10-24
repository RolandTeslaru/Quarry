import { useState } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Select } from '@quarry/standard-ui/foundations/select'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Tabs } from '@quarry/standard-ui/foundations/tabs'
import type { CodeWorkspace } from '@quarry/shared/domain'
import { App } from '@/AppKit'
import { CodeWorkspaceSDK } from '@/SDKs/CodeWorkspaceSDK/sdk'
import { ErrorNotice } from '@/components/ErrorNotice'
import { ResourceBreadcrumbs } from '@/components/ResourceBreadcrumbs'
import { useTask } from '@/hooks/useTask'
import { codeWorkspacesApp } from '../definition'
import { PreviewPanel, type PreviewRun } from './PreviewPanel'
import classNames from 'classnames';
import { Menubar } from '@quarry/standard-ui/foundations/menubar'

interface Props {
    rid: CodeWorkspace.Rid
}

/**
 * One Code Workspace: the user's session — VS Code in the browser — filling
 * the content; a transform of its working copy previewed on samples of its
 * inputs (picked in the header), the result under the editor.
 */
export function WorkspaceApp({ rid }: Props) {
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

                <Tabs.Root defaultValue='code' className='self-stretch' >
                    <Tabs.List variant='underline' className='h-full! px-4 border-l border-border'>
                        <Tabs.Trigger value='code'>Code</Tabs.Trigger>
                        <Tabs.Trigger value='branches'>Branches</Tabs.Trigger>
                        <Tabs.Trigger value='checks'>Checks</Tabs.Trigger>
                        <Tabs.Trigger value='pull-requests'>Pull Requests</Tabs.Trigger>
                        <Tabs.Trigger value='settings'>Settings</Tabs.Trigger>
                    </Tabs.List>
            
                    <Tabs.Content value='preview'>…</Tabs.Content>
                </Tabs.Root>

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
            </App.Header>

            <App.Content className='overflow-hidden'>
                <div className='min-h-0 flex-1'>
                    <SessionFrame request={sessionRequest} />
                </div>

                {preview && (
                    <PreviewPanel
                        run={preview}
                        onRerun={() => runPreview(preview.transform)}
                        onClose={() => setPreview(null)}
                    />
                )}
            </App.Content>
        </>
    )
}

interface SessionFrameProps {
    request: UseQueryResult<CodeWorkspace.API.OpenSession.Response>
}

/** The IDE, once the session is up. Starting one clones and installs the environment: a minute, the first time. */
function SessionFrame({ request }: SessionFrameProps) {
    if (request.isPending) {
        return (
            <div className='flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground'>
                <Spinner className='size-6' role='status' aria-label='Starting the session' />
                Starting your session — the first time takes a minute.
            </div>
        )
    }

    if (request.error || !request.data) {
        return (
            <div className='p-6'>
                <ErrorNotice error={request.error ?? 'The session didn’t start.'} />
                <Button onClick={() => void request.refetch()}>Try again</Button>
            </div>
        )
    }

    return (
        <iframe
            // A reconnect may have restarted the session: reload the editor with it.
            key={request.dataUpdatedAt}
            src={request.data.url}
            title='Code editor'
            className='size-full border-0'
            allow='clipboard-read; clipboard-write'
        />
    )
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
