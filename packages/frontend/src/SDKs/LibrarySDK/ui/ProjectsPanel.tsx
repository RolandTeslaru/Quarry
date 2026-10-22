import { useTask } from '@/hooks/useTask'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import { SearchInput } from '@quarry/standard-ui/foundations/searchInput'
import { useId, useState, type FormEvent } from 'react'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Card } from '@quarry/standard-ui/foundations/card'
import { Field } from '@quarry/standard-ui/foundations/fieldLayout'
import { Icon } from '@quarry/standard-ui/icons'
import { Input } from '@quarry/standard-ui/foundations/input'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Link } from '@tanstack/react-router'
import { LibrarySDK } from '../sdk'
import { AuthSDK } from '@/SDKs/AuthSDK/sdk'
import { Dialog } from '@quarry/standard-ui/foundations/dialog'
import { ErrorNotice } from '@/components/ErrorNotice'
import { PageHeader } from '@/components/PageHeader'
import { Empty } from '@/components/Empty'

export function ProjectsPanel() {
    const [search, setSearch] = useState('')

    const user = AuthSDK.useStore(state => state.user)
    const [projects, [projectsRequest]] = LibrarySDK.useWith(
        LibrarySDK.selectors.projects,
        query => [query.projects],
    )

    const filtered = projects.filter(project =>
        project.name.toLowerCase().includes(search.toLowerCase()),
    )

    function openCreateDialog() {
        DialogSDK.actions.push('new-project', dialog => <NewProjectDialog dialog={dialog} />)
    }

    return (
        <>
            <PageHeader
                eyebrow='YOUR WORKSPACE'
                title='Projects & data'
                description='A shared home for your sources, datasets, and the work you build around them.'
                actions={(
                    <Button
                        intent='primary'
                        icon='add'
                        disabled={user?.workspaceRole !== 'admin'}
                        onClick={openCreateDialog}
                    >
                        New project
                    </Button>
                )}
            />

            <div className='section-toolbar'>
                <SearchInput
                    placeholder='Find a project…'
                    aria-label='Find a project'
                    onSearch={setSearch}
                />
                <Button
                    icon='refresh'
                    variant='minimal'
                    aria-label='Refresh projects'
                    loading={projectsRequest.isFetching}
                    onClick={() => void projectsRequest.refetch()}
                />
            </div>

            <ErrorNotice error={projectsRequest.error} />

            {projectsRequest.isPending && <Spinner className='size-6' role='status' aria-label='Loading' />}

            {projectsRequest.isSuccess && projects.length === 0 && (
                <Empty
                    icon='projects'
                    title='Start with a project'
                    description='Projects organize your connections, folders, and versioned datasets.'
                    action={(
                        <Button
                            intent='primary'
                            disabled={user?.workspaceRole !== 'admin'}
                            onClick={openCreateDialog}
                        >
                            Create project
                        </Button>
                    )}
                />
            )}

            <div className='project-grid'>
                {filtered.map(project => (
                    <Link key={project.rid} to='/resources/$rid' params={{ rid: project.rid }}>
                        <Card.Root className='project-card'>
                            <div className='project-icon'>
                                <Icon name='folder-close' size={22} />
                            </div>
                            <h2>{project.name}</h2>
                            <p>{project.description || 'Sources, datasets, and everything that connects them.'}</p>
                            <div className='project-card-footer'>
                                <span>PROJECT</span>
                                <Icon name='arrow-right' />
                            </div>
                        </Card.Root>
                    </Link>
                ))}
            </div>

            {projects.length > 0 && filtered.length === 0 && (
                <p className='text-slate-500 py-8'>No projects match your search.</p>
            )}
        </>
    )
}

interface NewProjectProps {
    dialog: DialogSDK.TemplateProps
}

function NewProjectDialog({ dialog }: NewProjectProps) {
    const formId = useId()
    const task = useTask()

    const [name, setName] = useState('')
    const [description, setDescription] = useState('')

    const create = async () => {
        await LibrarySDK.actions.project.create({ name, description: description || null })
    }

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        if (task.pending)
            return

        void task.run(async () => {
            await create()

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
                <Dialog.Title>New project</Dialog.Title>
            </Dialog.Header>
            <Dialog.Description className='sr-only'>
                Complete the fields below, then choose create.
            </Dialog.Description>
            <Dialog.Body>
                <form id={formId} onSubmit={submit}>
                    <Field.Set disabled={task.pending}>
                        <Field.Root>
                            <Field.Label htmlFor='project-name'>Name</Field.Label>
                            <Input
                                id='project-name'
                                autoFocus
                                required
                                value={name}
                                onChange={event => setName(event.target.value)}
                            />
                        </Field.Root>
                        <Field.Root>
                            <Field.Label htmlFor='project-description'>Description</Field.Label>
                            <Input
                                id='project-description'
                                value={description}
                                onChange={event => setDescription(event.target.value)}
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
