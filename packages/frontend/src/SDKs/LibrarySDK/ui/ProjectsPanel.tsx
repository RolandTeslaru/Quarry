import { useState } from 'react'
import { Button, Card, FormGroup, Icon, InputGroup, Spinner } from '@blueprintjs/core'
import { Link } from '@tanstack/react-router'
import { LibrarySDK } from '../sdk'
import { AuthSDK } from '@/SDKs/AuthSDK/sdk'
import { CreateDialog } from '@/components/CreateDialog'
import { ErrorNotice } from '@/components/ErrorNotice'
import { PageHeader } from '@/components/PageHeader'
import { Empty } from '@/components/Empty'

export function ProjectsPanel() {
    const [isCreating, setIsCreating] = useState(false)
    const [search, setSearch] = useState('')

    const user = AuthSDK.useStore(state => state.user)
    const [projects, [projectsRequest]] = LibrarySDK.useWith(
        LibrarySDK.selectors.projects,
        query => [query.projects],
    )

    const filtered = projects.filter(project =>
        project.name.toLowerCase().includes(search.toLowerCase()),
    )

    return (
        <>
            <PageHeader
                eyebrow='YOUR WORKSPACE'
                title='Projects & data'
                description='A shared home for your sources, datasets, and the work you build around them.'
                actions={(
                    <Button
                        intent='primary'
                        icon='plus'
                        disabled={user?.workspaceRole !== 'admin'}
                        onClick={() => setIsCreating(true)}
                    >
                        New project
                    </Button>
                )}
            />

            <div className='section-toolbar'>
                <InputGroup
                    leftIcon='search'
                    placeholder='Find a project…'
                    aria-label='Find a project'
                    value={search}
                    onChange={event => setSearch(event.target.value)}
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

            {projectsRequest.isPending && <Spinner size={24} />}

            {projectsRequest.isSuccess && projects.length === 0 && (
                <Empty
                    icon='projects'
                    title='Start with a project'
                    description='Projects organize your connections, folders, and versioned datasets.'
                    action={(
                        <Button
                            intent='primary'
                            disabled={user?.workspaceRole !== 'admin'}
                            onClick={() => setIsCreating(true)}
                        >
                            Create project
                        </Button>
                    )}
                />
            )}

            <div className='project-grid'>
                {filtered.map(project => (
                    <Link key={project.rid} to='/resources/$rid' params={{ rid: project.rid }}>
                        <Card interactive className='project-card'>
                            <div className='project-icon'>
                                <Icon icon='folder-close' size={22} />
                            </div>
                            <h2>{project.name}</h2>
                            <p>{project.description || 'Sources, datasets, and everything that connects them.'}</p>
                            <div className='project-card-footer'>
                                <span>PROJECT</span>
                                <Icon icon='arrow-right' />
                            </div>
                        </Card>
                    </Link>
                ))}
            </div>

            {projects.length > 0 && filtered.length === 0 && (
                <p className='text-slate-500 py-8'>No projects match your search.</p>
            )}

            {isCreating && <NewProjectDialog onClose={() => setIsCreating(false)} />}
        </>
    )
}

function NewProjectDialog({ onClose }: { onClose: () => void }) {
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')

    const create = async () => {
        await LibrarySDK.actions.project.create({ name, description: description || null })
    }

    return (
        <CreateDialog title='New project' onClose={onClose} onSubmit={create}>
            <FormGroup label='Name' labelFor='project-name'>
                <InputGroup
                    id='project-name'
                    autoFocus
                    required
                    value={name}
                    onChange={event => setName(event.target.value)}
                />
            </FormGroup>
            <FormGroup label='Description' labelFor='project-description'>
                <InputGroup
                    id='project-description'
                    value={description}
                    onChange={event => setDescription(event.target.value)}
                />
            </FormGroup>
        </CreateDialog>
    )
}
