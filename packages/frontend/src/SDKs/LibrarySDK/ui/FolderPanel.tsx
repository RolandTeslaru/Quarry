import { useTask } from '@/hooks/useTask'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import { SearchInput } from '@quarry/standard-ui/foundations/searchInput'
import { useId, useState, type FormEvent } from 'react'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Field } from '@quarry/standard-ui/foundations/fieldLayout'
import { Table } from '@quarry/standard-ui/foundations/table'
import { Input } from '@quarry/standard-ui/foundations/input'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Badge } from '@quarry/standard-ui/foundations/Badge'
import type { Library } from '@quarry/shared/domain'
import { LibrarySDK } from '../sdk'
import { NewSourceDialog } from '@/SDKs/DataConnectionSDK/ui/NewSourceDialog'
import { UploadDialog } from '@/SDKs/CatalogSDK/ui/UploadDialog'
import { Dialog } from '@quarry/standard-ui/foundations/dialog'
import { Empty } from '@/components/Empty'
import { ErrorNotice } from '@/components/ErrorNotice'
import { PageHeader } from '@/components/PageHeader'
import { ResourceLink } from '@/components/ResourceLink'
import { dateTime } from '@/utils/format'

interface Props {
    resource: Library.Resource.Base
}

export function FolderPanel({ resource }: Props) {
    const [search, setSearch] = useState('')

    const [children, [childrenRequest]] = LibrarySDK.useWith(
        state => LibrarySDK.selectors.children(state, resource.rid),
        query => [query.children(resource.rid)],
    )

    const filtered = children.filter(child =>
        child.name.toLowerCase().includes(search.toLowerCase()),
    )

    function openFolderDialog() {
        DialogSDK.actions.push(`new-folder-${resource.rid}`, dialog => (
            <NewFolderDialog parentRid={resource.rid} dialog={dialog} />
        ))
    }

    function openUploadDialog() {
        DialogSDK.actions.push(`upload-${resource.rid}`, dialog => (
            <UploadDialog target={{ kind: 'new', parentRid: resource.rid }} dialog={dialog} />
        ))
    }

    function openSourceDialog() {
        DialogSDK.actions.push(`new-source-${resource.rid}`, dialog => (
            <NewSourceDialog parentRid={resource.rid} dialog={dialog} />
        ))
    }

    return (
        <>
            <PageHeader
                eyebrow={resource.type.toUpperCase()}
                title={resource.name}
                description={resource.description ?? 'Organize sources and the datasets they produce.'}
                actions={(
                    <>
                        <Button icon='folder-new' onClick={openFolderDialog}>
                            New folder
                        </Button>
                        <Button icon='upload' onClick={openUploadDialog}>
                            Upload file
                        </Button>
                        <Button intent='primary' icon='add' onClick={openSourceDialog}>
                            Connect source
                        </Button>
                    </>
                )}
            />

            <div className='section-toolbar'>
                <SearchInput
                    placeholder='Find sources, datasets, or folders…'
                    aria-label='Find resources'
                    onSearch={setSearch}
                />
                <Button
                    variant='minimal'
                    icon='refresh'
                    aria-label='Refresh folder'
                    loading={childrenRequest.isFetching}
                    onClick={() => void childrenRequest.refetch()}
                />
            </div>

            <ErrorNotice error={childrenRequest.error} />

            {childrenRequest.isPending && <Spinner className='size-6' role='status' aria-label='Loading' />}

            {childrenRequest.isSuccess && children.length === 0 && (
                <Empty
                    icon='database'
                    title='Bring your first source into Quarry'
                    description='Connect a database, choose what to sync, and create a versioned dataset, or upload a CSV or Parquet file.'
                    action={(
                        <div className='flex gap-2'>
                            <Button intent='primary' onClick={openSourceDialog}>
                                Connect source
                            </Button>
                            <Button icon='upload' onClick={openUploadDialog}>
                                Upload file
                            </Button>
                        </div>
                    )}
                />
            )}

            {filtered.length > 0 && (
                <div className='table-panel'>
                    <Table.Root className='data-table'>
                        <Table.Header>
                            <Table.Row>
                                <Table.Head>Name</Table.Head>
                                <Table.Head>Type</Table.Head>
                                <Table.Head>Description</Table.Head>
                                <Table.Head>Last updated</Table.Head>
                            </Table.Row>
                        </Table.Header>
                        <Table.Body>
                            {filtered.map(child => (
                                <Table.Row key={child.rid}>
                                    <Table.Cell>
                                        <ResourceLink resource={child} />
                                    </Table.Cell>
                                    <Table.Cell>
                                        <Badge variant='secondary'>{child.type}</Badge>
                                    </Table.Cell>
                                    <Table.Cell className='text-slate-500'>{child.description || '—'}</Table.Cell>
                                    <Table.Cell>{dateTime(child.updatedAt)}</Table.Cell>
                                </Table.Row>
                            ))}
                        </Table.Body>
                    </Table.Root>
                </div>
            )}

            {children.length > 0 && filtered.length === 0 && (
                <p className='text-slate-500 py-8'>No resources match your search.</p>
            )}
        </>
    )
}

interface NewFolderProps {
    parentRid: Library.Resource.Rid
    dialog:    DialogSDK.TemplateProps
}

function NewFolderDialog({ parentRid, dialog }: NewFolderProps) {
    const formId = useId()
    const task = useTask()

    const [name, setName] = useState('')

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        if (task.pending)
            return

        void task.run(async () => {
            await LibrarySDK.actions.folder.create({ parentRid, name, description: null })

            DialogSDK.actions.pop(dialog.entry.dialogId)
        })
    }

    return (
        <DialogSDK.Template
            {...dialog}
            dismissible={!task.pending}
            className='w-[min(520px,calc(100vw-32px))]'
        >
            <Dialog.Header>
                <Dialog.Title>New folder</Dialog.Title>
            </Dialog.Header>
            <Dialog.Description className='sr-only'>
                Complete the fields below, then choose create.
            </Dialog.Description>
            <Dialog.Body>
                <form id={formId} onSubmit={submit}>
                    <Field.Set disabled={task.pending}>
                        <Field.Root>
                            <Field.Label htmlFor='folder-name'>Name</Field.Label>
                            <Input
                                id='folder-name'
                                autoFocus
                                required
                                value={name}
                                onChange={event => setName(event.target.value)}
                            />
                        </Field.Root>
                    </Field.Set>
                    <ErrorNotice error={task.error} />
                </form>
            </Dialog.Body>
            <Dialog.Footer>
                <Dialog.Cancel disabled={task.pending}>Cancel</Dialog.Cancel>
                <Dialog.Action
                    type='submit'
                    form={formId}
                    intent='primary'
                    loading={task.pending}
                >
                    Create
                </Dialog.Action>
            </Dialog.Footer>
        </DialogSDK.Template>
    )
}
