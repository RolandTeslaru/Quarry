import type { IconName } from '@quarry/standard-ui/icons'
import { Link } from '@tanstack/react-router'
import type { Library } from '@quarry/shared/domain'
import { ResourceIcon, type ResourceIconSize } from './ResourceIcon'
import { resourceRoute } from '@/shell/apps'

const RESOURCE_ICONS: Record<Library.Resource.Type, IconName> = {
    project: 'projects',
    folder: 'folder-close',
    source: 'database',
    dataset: 'th',
    credential: 'key',
    workspace: 'code',
}

export function resourceIcon(type: Library.Resource.Type): IconName {
    return RESOURCE_ICONS[type]
}

interface Props {
    resource:  Pick<Library.Resource.Base, 'rid' | 'name' | 'type'>
    /** Its icon's size — xs inline (the default). */
    iconSize?: ResourceIconSize
}

export function ResourceLink({ resource, iconSize = 'xs' }: Props) {
    return (
        <Link
            {...resourceRoute(resource.type, resource.rid)}
            className='resource-link'
        >
            <ResourceIcon type={resource.type} size={iconSize} />
            <span>{resource.name}</span>
        </Link>
    )
}
