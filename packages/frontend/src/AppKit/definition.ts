import type { LinkProps, ToOptions } from '@tanstack/react-router'
import type { Library } from '@quarry/shared/domain'
import type { IconName } from '@quarry/standard-ui/icons'

/** What the shell knows about an app: how to show it, where it starts, and what it opens. */
export interface Definition {
    id:           string
    label:        string
    icon:         IconName
    /** The app's home route (`/<app>`), opened from the launcher and the sidebar. */
    to:           LinkProps['to']
    /** Listed in the workspace sidebar. */
    inNavigation: boolean
    /** The resource types this app opens, and the route each one opens at. */
    opens:        Partial<Record<Library.Resource.Type, (rid: Library.Resource.Rid) => ToOptions>>
}
