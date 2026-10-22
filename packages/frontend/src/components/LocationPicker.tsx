import { useId } from 'react'
import { Field } from '@quarry/standard-ui/foundations/fieldLayout'
import { Select } from '@quarry/standard-ui/foundations/select'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Library } from '@quarry/shared/domain'
import { LibrarySDK } from '@/SDKs/LibrarySDK/sdk'
import { Link } from '@tanstack/react-router'
import { ErrorNotice } from './ErrorNotice'
import { FolderChoices } from './LocationPicker/FolderChoices'

interface Props {
    value:    Library.Resource.Rid | null
    onChange: (rid: Library.Resource.Rid) => void
}

export function LocationPicker({ value, onChange }: Props) {
    const descriptionId = useId()

    const [projects, [projectsRequest]] = LibrarySDK.useWith(
        LibrarySDK.selectors.projects,
        query => [query.projects],
    )

    const selectedProject = projects.find(project => project.rid === value)

    const selectProject = (selected: string) => {
        if (!selected)
            return

        onChange(Library.Resource.Rid.parse(selected))
    }

    return (
        <Field.Root>
            <Field.Title>Location</Field.Title>
            <Field.Description id={descriptionId}>Choose a project, then open a folder if needed.</Field.Description>
            {projectsRequest.isPending && (
                <Spinner className='size-4' role='status' aria-label='Loading' />
            )}

            <Select.Root
                disabled={projectsRequest.isPending}
                value={selectedProject?.rid ?? ''}
                onValueChange={selectProject}
            >
                <Select.Trigger size='default' aria-label='Project' aria-describedby={descriptionId}>
                    <Select.Value placeholder={value ? 'Choose another project…' : 'Choose a project…'} />
                </Select.Trigger>
                <Select.Content className='z-[100]'>
                    {projects.map(project => (
                        <Select.Item key={project.rid} value={project.rid}>
                            {project.name}
                        </Select.Item>
                    ))}
                </Select.Content>
            </Select.Root>

            <ErrorNotice error={projectsRequest.error} />

            {projectsRequest.isSuccess && projects.length === 0 && (
                <p className='text-xs mt-2'>
                    <Link to='/library'>Create a project</Link> before adding resources.
                </p>
            )}

            {value && (
                <FolderChoices rid={value} onChange={onChange} />
            )}
        </Field.Root>
    )
}
