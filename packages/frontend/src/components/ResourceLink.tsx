import { Icon, type IconName } from '@blueprintjs/core'
import { Link } from '@tanstack/react-router'
import type { Library } from '@quarry/shared/domain'

const RESOURCE_ICONS: Record<Library.Resource.Type, IconName> = {
    project: 'projects',
    folder: 'folder-close',
    source: 'database',
    dataset: 'th',
    credential: 'key',
}

export function resourceIcon(type: Library.Resource.Type): IconName {
    return RESOURCE_ICONS[type]
}

interface Props {
    resource: Pick<Library.Resource.Base, 'rid' | 'name' | 'type'>
}

export function ResourceLink({ resource }: Props) {
    return (
        <Link
            to='/resources/$rid'
            params={{ rid: resource.rid }}
            className='resource-link'
        >
            <Icon icon={resourceIcon(resource.type)} />
            <span>{resource.name}</span>
        </Link>
    )
}
