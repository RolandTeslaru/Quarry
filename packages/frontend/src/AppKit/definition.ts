import type { LinkProps, ToOptions } from '@tanstack/react-router'
import type { Library } from '@quarry/shared/domain'
import type { GlyphDefinition } from './glyph/Glyph'

/** What the shell knows about an app: how to show it, where it starts, and what it opens. */
export interface Definition {
    id:           string
    label:        string
    /** Its coloured icon: header square, Launchpad, sidebar. */
    glyph:        GlyphDefinition
    /** The app's home route (`/<app>`), opened from the launcher and the sidebar. */
    to:           LinkProps['to']
    /** Listed in the workspace sidebar. */
    inNavigation: boolean
    /** The resource types this app opens, and the route each one opens at. */
    opens:        Partial<Record<Library.Resource.Type, (rid: Library.Resource.Rid) => ToOptions>>
}
