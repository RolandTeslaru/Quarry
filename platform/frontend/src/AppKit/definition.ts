import type { LinkProps, ToOptions } from '@tanstack/react-router'
import type { Library, Platform } from '@quarry/shared/domain'
import type { GlyphDefinition } from './glyph/Glyph'

/** What the shell knows about an app: how to show it, where it starts, and what it opens. */
export interface Definition {
    /** Its id in the platform's registry (Platform.Application.Id) — how the server knows it. */
    id:           Platform.Application.Id
    label:        string
    /** One or two sentences: what the app is for. Under its name on its home screen. */
    description:  string
    /** Its coloured icon: header square, Launchpad, sidebar. */
    glyph:        GlyphDefinition
    /** The app's home route (`/<app>`), opened from the launcher and the sidebar. */
    to:           LinkProps['to']
    /** Listed in the workspace sidebar. */
    inNavigation: boolean
    /** Its home screen's look; apps without one (the Library's home is its explorer) leave it out. */
    home?:        HomeLook
    /** The resource types this app opens, and the route each one opens at. */
    opens:        Partial<Record<Library.Resource.Type, (rid: Library.Resource.Rid) => ToOptions>>
}

/** The dither behind an app's home header: the app's tint, and how its waves move. */
export interface HomeLook {
    /** A palette variable, e.g. `--color-sky-600` — the app's own colour, not `--primary`. */
    tint:  `--color-${string}`
    wave?: {
        speed?:     number
        frequency?: number
        amplitude?: number
        /** Colour steps in the dither: fewer is coarser. */
        steps?:     number
    }
}
