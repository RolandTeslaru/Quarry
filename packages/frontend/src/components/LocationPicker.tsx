import { FormGroup, HTMLSelect, Spinner } from '@blueprintjs/core'
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
        <FormGroup
            label='Location'
            helperText='Choose a project, then open a folder if needed.'
        >
            {projectsRequest.isPending && (
                <Spinner size={16} />
            )}

            <HTMLSelect
                fill
                aria-label='Project'
                disabled={projectsRequest.isPending}
                value={selectedProject?.rid ?? ''}
                onChange={event => selectProject(event.target.value)}
            >
                <option value=''>
                    {value ? 'Choose another project…' : 'Choose a project…'}
                </option>

                {projects.map(project => (
                    <option key={project.rid} value={project.rid}>
                        {project.name}
                    </option>
                ))}
            </HTMLSelect>

            <ErrorNotice error={projectsRequest.error} />

            {projectsRequest.isSuccess && projects.length === 0 && (
                <p className='text-xs mt-2'>
                    <Link to='/library'>Create a project</Link> before adding resources.
                </p>
            )}

            {value && (
                <FolderChoices rid={value} onChange={onChange} />
            )}
        </FormGroup>
    )
}
