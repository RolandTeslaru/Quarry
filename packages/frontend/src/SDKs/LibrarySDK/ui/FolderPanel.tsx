import { useState } from 'react'
import { Button, FormGroup, HTMLTable, InputGroup, Spinner, Tag } from '@blueprintjs/core'
import type { Library } from '@quarry/shared/domain'
import { LibrarySDK } from '../sdk'
import { NewSourceDialog } from '@/SDKs/DataConnectionSDK/ui/NewSourceDialog'
import { CreateDialog } from '@/components/CreateDialog'
import { Empty } from '@/components/Empty'
import { ErrorNotice } from '@/components/ErrorNotice'
import { PageHeader } from '@/components/PageHeader'
import { ResourceLink } from '@/components/ResourceLink'
import { dateTime } from '@/utils/format'

interface Props {
    resource: Library.Resource.Base
}

export function FolderPanel({ resource }: Props) {
    const [dialog, setDialog] = useState<'folder' | 'source' | null>(null)
    const [search, setSearch] = useState('')

    const [children, [childrenRequest]] = LibrarySDK.useWith(
        state => LibrarySDK.selectors.children(state, resource.rid),
        query => [query.children(resource.rid)],
    )

    const filtered = children.filter(child =>
        child.name.toLowerCase().includes(search.toLowerCase()),
    )

    return (
        <>
            <PageHeader
                eyebrow={resource.type.toUpperCase()}
                title={resource.name}
                description={resource.description ?? 'Organize sources and the datasets they produce.'}
                actions={(
                    <>
                        <Button icon='folder-new' onClick={() => setDialog('folder')}>
                            New folder
                        </Button>
                        <Button intent='primary' icon='add' onClick={() => setDialog('source')}>
                            Connect source
                        </Button>
                    </>
                )}
            />

            <div className='section-toolbar'>
                <InputGroup
                    leftIcon='search'
                    placeholder='Find sources, datasets, or folders…'
                    aria-label='Find resources'
                    value={search}
                    onChange={event => setSearch(event.target.value)}
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

            {childrenRequest.isPending && <Spinner size={24} />}

            {childrenRequest.isSuccess && children.length === 0 && (
                <Empty
                    icon='database'
                    title='Bring your first source into Quarry'
                    description='Connect a database, choose what to sync, and create a versioned dataset.'
                    action={(
                        <Button intent='primary' onClick={() => setDialog('source')}>
                            Connect source
                        </Button>
                    )}
                />
            )}

            {filtered.length > 0 && (
                <div className='table-panel'>
                    <HTMLTable striped interactive className='data-table'>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Type</th>
                                <th>Description</th>
                                <th>Last updated</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(child => (
                                <tr key={child.rid}>
                                    <td>
                                        <ResourceLink resource={child} />
                                    </td>
                                    <td>
                                        <Tag minimal>{child.type}</Tag>
                                    </td>
                                    <td className='text-slate-500'>{child.description || '—'}</td>
                                    <td>{dateTime(child.updatedAt)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </HTMLTable>
                </div>
            )}

            {children.length > 0 && filtered.length === 0 && (
                <p className='text-slate-500 py-8'>No resources match your search.</p>
            )}

            {dialog === 'folder' && (
                <NewFolderDialog parentRid={resource.rid} onClose={() => setDialog(null)} />
            )}

            {dialog === 'source' && (
                <NewSourceDialog parentRid={resource.rid} onClose={() => setDialog(null)} />
            )}
        </>
    )
}

interface NewFolderProps {
    parentRid: Library.Resource.Rid
    onClose:   () => void
}

function NewFolderDialog({ parentRid, onClose }: NewFolderProps) {
    const [name, setName] = useState('')

    return (
        <CreateDialog
            title='New folder'
            onClose={onClose}
            onSubmit={() => LibrarySDK.actions.folder.create(parentRid, { name, description: null })}
        >
            <FormGroup label='Name' labelFor='folder-name'>
                <InputGroup
                    id='folder-name'
                    autoFocus
                    required
                    value={name}
                    onChange={event => setName(event.target.value)}
                />
            </FormGroup>
        </CreateDialog>
    )
}
