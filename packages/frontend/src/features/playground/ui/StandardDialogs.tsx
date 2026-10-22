import { useState, type FormEvent } from 'react'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import { Dialog } from '@quarry/standard-ui/foundations/dialog'
import { AlertDialog } from '@quarry/standard-ui/foundations/alertDialog'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Input } from '@quarry/standard-ui/foundations/input'
import { Label } from '@quarry/standard-ui/foundations/label'

const DIALOG_WIDTH = 'w-[min(420px,calc(100vw-32px))] p-4'
const SPLIT_WIDTH = 'w-[min(560px,calc(100vw-32px))]'

interface DatasetDialogProps {
    dialogId: string
    depth: number
    onCreated: (name: string) => void
}

function openDatasetDialog(onCreated: (name: string) => void, depth = 0) {
    const dialogId = `playground-dataset-${depth}`

    DialogSDK.actions.push(dialogId, (props) => (
        <DialogSDK.Template {...props} className={DIALOG_WIDTH}>
            <DatasetDialog dialogId={dialogId} depth={depth} onCreated={onCreated} />
        </DialogSDK.Template>
    ))
}

function DatasetDialog({ dialogId, depth, onCreated }: DatasetDialogProps) {
    const [name, setName] = useState('Customer transactions')

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        onCreated(name.trim())
        DialogSDK.actions.pop(dialogId)
    }

    function openNextDialog() {
        openDatasetDialog(onCreated, depth + 1)
    }

    return (
        <form onSubmit={handleSubmit} className='flex flex-col gap-5'>
            <Dialog.Header>
                <Dialog.Title>{depth === 0 ? 'Create a dataset' : `Stacked dialog ${depth + 1}`}</Dialog.Title>
                <Dialog.Description>
                    DialogSDK keeps the previous dialog mounted while the next one opens.
                </Dialog.Description>
            </Dialog.Header>
            <div className='flex flex-col gap-2'>
                <Label htmlFor={`dataset-name-${depth}`}>Dataset name</Label>
                <Input
                    id={`dataset-name-${depth}`}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                />
            </div>
            <Button variant='outlined' onClick={openNextDialog}>
                Open another dialog
            </Button>
            <Dialog.Footer>
                <Dialog.Cancel>Cancel</Dialog.Cancel>
                <Dialog.Action type='submit' intent='primary' disabled={!name.trim()}>
                    Create
                </Dialog.Action>
            </Dialog.Footer>
        </form>
    )
}

function closeDialog(dialogId: string) {
    DialogSDK.actions.pop(dialogId)
}

function openSplitDialog() {
    const dialogId = 'playground-split'

    DialogSDK.actions.push(dialogId, (props) => (
        <DialogSDK.SplitTemplate
            {...props}
            className={SPLIT_WIDTH}
            sidebarClassName='min-w-40! w-40 px-4'
            sidebarRenderer={() => (
                <DialogSDK.SplitTemplate.Header>
                    <DialogSDK.SplitTemplate.Icon icon='database' />
                    <DialogSDK.SplitTemplate.Title>Dataset</DialogSDK.SplitTemplate.Title>
                    <DialogSDK.SplitTemplate.Description>Production / Analytics</DialogSDK.SplitTemplate.Description>
                </DialogSDK.SplitTemplate.Header>
            )}
        >
            <Dialog.Header>
                <Dialog.Title>Dataset settings</Dialog.Title>
                <Dialog.Description>Separate sidebar and content surfaces from DialogSDK.</Dialog.Description>
            </Dialog.Header>
            <Label htmlFor='split-dataset-name'>Name</Label>
            <Input id='split-dataset-name' defaultValue='Customers' />
            <Dialog.Footer>
                <Button onClick={() => closeDialog(dialogId)}>Close</Button>
            </Dialog.Footer>
        </DialogSDK.SplitTemplate>
    ))
}

function openTabsDialog() {
    const dialogId = 'playground-tabs'

    DialogSDK.actions.push(dialogId, (props) => (
        <DialogSDK.TabsTemplate
            {...props}
            className={SPLIT_WIDTH}
            sidebarClassName='min-w-40! w-40'
            contentClassName='h-[min(440px,calc(100dvh-80px))]!'
            defaultValue='general'
            header={{ icon: 'cog', title: 'Settings' }}
            items={[
                {
                    id: 'general',
                    label: 'General',
                    icon: 'cog',
                    panel: <p className='text-sm'>Manage the dataset name and description.</p>,
                },
                {
                    id: 'credentials',
                    label: 'Credentials',
                    icon: 'key',
                    panel: <p className='text-sm'>Choose the credential used by this source.</p>,
                },
                {
                    id: 'history',
                    label: 'History',
                    icon: 'history',
                    panel: <p className='text-sm'>Last sync completed successfully.</p>,
                },
            ]}
            sidebarBottomRenderer={() => <Button onClick={() => closeDialog(dialogId)}>Close</Button>}
        >
            <Dialog.Title className='sr-only'>Dataset settings</Dialog.Title>
            <Dialog.Description className='sr-only'>Settings organized into sidebar tabs.</Dialog.Description>
        </DialogSDK.TabsTemplate>
    ))
}

function openTripleDialog() {
    const dialogId = 'playground-triple'

    DialogSDK.actions.push(dialogId, (props) => (
        <DialogSDK.TripleSplitTemplate
            {...props}
            className={SPLIT_WIDTH}
            leftSidebarClassName='min-w-28! w-28'
            rightSidebarClassName='min-w-28! w-28'
            leftSidebarRenderer={() => <p className='text-sm'>Datasets</p>}
            rightSidebarRenderer={() => <p className='text-sm'>Properties</p>}
        >
            <Dialog.Header>
                <Dialog.Title>Inspect a dataset</Dialog.Title>
                <Dialog.Description>A three-surface DialogSDK template.</Dialog.Description>
            </Dialog.Header>
            <p className='text-sm'>Customers · 12,480 rows</p>
            <Dialog.Footer>
                <Button onClick={() => closeDialog(dialogId)}>Close</Button>
            </Dialog.Footer>
        </DialogSDK.TripleSplitTemplate>
    ))
}

function openCustomDialog() {
    const dialogId = 'playground-custom'

    DialogSDK.actions.push(dialogId, (props) => (
        <DialogSDK.UnstyledTemplate {...props} className='w-[min(420px,calc(100vw-32px))]'>
            <div className='surface-elevated rounded-2xl border p-5 shadow-xl' style={props.surfaceStyle}>
                <Dialog.Header>
                    <Dialog.Title>Custom surface</Dialog.Title>
                    <Dialog.Description>
                        The SDK supplies motion and stacking; this surface owns its styling.
                    </Dialog.Description>
                </Dialog.Header>
                <Dialog.Footer className='mt-5'>
                    <Button onClick={() => closeDialog(dialogId)}>Close</Button>
                </Dialog.Footer>
            </div>
        </DialogSDK.UnstyledTemplate>
    ))
}

export function StandardDialogs() {
    const [message, setMessage] = useState('Dialogs are opened through DialogSDK.actions.push.')

    function handleCreated(name: string) {
        setMessage(`Created “${name}” in this preview.`)
    }

    function openDialog() {
        openDatasetDialog(handleCreated)
    }

    function openStack() {
        openDatasetDialog(handleCreated)
        openDatasetDialog(handleCreated, 1)
    }

    return (
        <div className='demo-stack'>
            <div className='demo-line'>
                <Button onClick={openDialog}>Open dialog</Button>
                <Button onClick={openStack}>Stack dialogs</Button>
                <Button onClick={openSplitDialog}>Split dialog</Button>
                <Button onClick={openTabsDialog}>Tabbed dialog</Button>
                <Button onClick={openTripleDialog}>Three panels</Button>
                <Button onClick={openCustomDialog}>Custom surface</Button>
            </div>
            <p className='demo-note' role='status'>
                {message}
            </p>
        </div>
    )
}

export function StandardAlerts() {
    const [message, setMessage] = useState('This preview does not delete workspace data.')

    function openAlert() {
        DialogSDK.actions.push('playground-confirmation', (props) => (
            <DialogSDK.AlertTemplate
                {...props}
                type='danger'
                className='w-[min(480px,calc(100vw-32px))]'
                approveLabel='Delete'
                onApprove={() => setMessage('Deletion confirmed in this preview.')}
            >
                <AlertDialog.Title>Delete this dataset?</AlertDialog.Title>
                <AlertDialog.Description>
                    This confirmation uses DialogSDK.AlertTemplate and the shared dialog stack.
                </AlertDialog.Description>
            </DialogSDK.AlertTemplate>
        ))
    }

    return (
        <div className='demo-stack'>
            <Button className='w-fit' intent='danger' onClick={openAlert}>
                Delete dataset
            </Button>
            <p className='demo-note' role='status'>
                {message}
            </p>
        </div>
    )
}
