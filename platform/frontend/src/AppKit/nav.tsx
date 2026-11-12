import type { ComponentProps } from 'react'
import { Breadcrumb } from '@quarry/standard-ui/foundations/breadcrumb'
import { Menubar as MenubarPrimitive } from '@quarry/standard-ui/foundations/menubar'
import { cn } from '@quarry/standard-ui/utils/cn'
import { Overlay } from '@/components/overlay'
import { Glyph, type GlyphDefinition } from './glyph/Glyph'

/** The top bar, one panel floating over the content: `Start` at the left, `End` at the right. */
function NavRoot({ className, ...props }: ComponentProps<'div'>) {
    return (
        <Overlay.Panel
            data-slot='app-nav'
            className={cn('z-10 mt-surface-gap flex h-(--app-nav-height) items-center justify-between gap-3 [grid-area:nav]', className)}
            {...props}
        />
    )
}

/** The left side: the app's icon square, then rows (breadcrumbs, menubar). */
function Start({ className, ...props }: ComponentProps<'div'>) {
    return (
        <div
            data-slot='app-nav-start'
            className={cn('flex min-w-0 items-center gap-3 self-stretch', className)}
            {...props}
        />
    )
}

/** The right side: search, the main actions (save, share, sidebar toggles). */
function End({ className, ...props }: ComponentProps<'div'>) {
    return (
        <div
            data-slot='app-nav-end'
            className={cn('flex shrink-0 items-center gap-2 pr-2', className)}
            {...props}
        />
    )
}

interface IconProps {
    glyph: GlyphDefinition
}

/**
 * The app's square at the start of the nav — the same width as the left nav
 * below it. The square is the glyph's tile, filled with the app's accent tint.
 */
function Icon({ glyph }: IconProps) {
    return (
        <div
            data-slot='app-nav-icon'
            className={cn('grid w-12 shrink-0 place-items-center self-stretch border-r border-border', glyph.tile)}
        >
            <Glyph glyph={glyph} size={28} bare />
        </div>
    )
}

/** Stacked rows: usually breadcrumbs and title above, the menubar below. */
function Rows({ className, ...props }: ComponentProps<'div'>) {
    return (
        <div
            data-slot='app-nav-rows'
            className={cn('flex min-w-0 flex-col justify-center gap-0.5 first:pl-3', className)}
            {...props}
        />
    )
}

/** Side-by-side columns: e.g. a title next to a status badge, or several `Rows` groups. */
function Cols({ className, ...props }: ComponentProps<'div'>) {
    return (
        <div
            data-slot='app-nav-cols'
            className={cn('flex min-w-0 items-center gap-3 first:pl-3', className)}
            {...props}
        />
    )
}

/** Where the resource is; children are `Breadcrumb.Item`s, the last usually holding `App.Nav.Title`. */
function Breadcrumbs({ className, children, ...props }: ComponentProps<'nav'>) {
    return (
        <Breadcrumb.Root data-slot='app-nav-breadcrumbs' className={cn('min-w-0', className)} {...props}>
            <Breadcrumb.List className='flex-nowrap text-xs'>
                {children}
            </Breadcrumb.List>
        </Breadcrumb.Root>
    )
}

/** The resource or page name. */
function Title({ className, ...props }: ComponentProps<'h1'>) {
    return (
        <h1
            data-slot='app-nav-title'
            className={cn('truncate text-sm font-semibold text-foreground', className)}
            {...props}
        />
    )
}

/** File, Help, … — a standard Menubar sized for the nav. */
function Menubar({ className, ...props }: ComponentProps<typeof MenubarPrimitive.Root>) {
    return (
        <MenubarPrimitive.Root
            data-slot='app-nav-menubar'
            className={cn('h-6 p-0', className)}
            {...props}
        />
    )
}

export const Nav = Object.assign(NavRoot, {
    Start,
    End,
    Icon,
    Rows,
    Cols,
    Breadcrumbs,
    Title,
    Menubar,
})
