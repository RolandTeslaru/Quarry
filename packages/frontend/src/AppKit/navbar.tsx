import type { ComponentProps } from 'react'
import { Breadcrumb } from '@quarry/standard-ui/foundations/breadcrumb'
import { Menubar as MenubarPrimitive } from '@quarry/standard-ui/foundations/menubar'
import { Glyph, type GlyphDefinition } from './glyph/Glyph'
import { cn } from '@quarry/standard-ui/utils/cn'

/** The top band, 56px: the app's icon square, rows (breadcrumbs, menubar), actions on the right. */
function NavbarRoot({ className, ...props }: ComponentProps<'header'>) {
    return (
        <header
            data-slot='app-navbar'
            className={cn('surface-panel flex h-14 items-center gap-3 border-b pr-3 [grid-area:navbar]', className)}
            {...props}
        />
    )
}

interface IconProps {
    glyph: GlyphDefinition
}

/**
 * The app's corner square at the navbar's left — the same width as the left nav
 * below it. The square is the glyph's tile, filled with the app's accent tint.
 */
function Icon({ glyph }: IconProps) {
    return (
        <div
            data-slot='app-navbar-icon'
            className={cn('grid w-14 shrink-0 place-items-center self-stretch border-r border-border', glyph.tile)}
        >
            <Glyph glyph={glyph} size={28} bare />
        </div>
    )
}

/** Stacked rows: usually breadcrumbs and title above, the menubar below. */
function Rows({ className, ...props }: ComponentProps<'div'>) {
    return (
        <div
            data-slot='app-navbar-rows'
            className={cn('flex min-w-0 flex-col justify-center gap-0.5 first:pl-3', className)}
            {...props}
        />
    )
}

/** Side-by-side columns: e.g. a title next to a status badge, or several `Rows` groups. */
function Cols({ className, ...props }: ComponentProps<'div'>) {
    return (
        <div
            data-slot='app-navbar-cols'
            className={cn('flex min-w-0 items-center gap-3 first:pl-3', className)}
            {...props}
        />
    )
}

/** Where the resource is; children are `Breadcrumb.Item`s, the last usually holding `App.Navbar.Title`. */
function Breadcrumbs({ className, children, ...props }: ComponentProps<'nav'>) {
    return (
        <Breadcrumb.Root data-slot='app-navbar-breadcrumbs' className={cn('min-w-0', className)} {...props}>
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
            data-slot='app-navbar-title'
            className={cn('truncate text-sm font-semibold text-foreground', className)}
            {...props}
        />
    )
}

/** File, Help, … — a standard Menubar sized for the navbar. */
function Menubar({ className, ...props }: ComponentProps<typeof MenubarPrimitive.Root>) {
    return (
        <MenubarPrimitive.Root
            data-slot='app-navbar-menubar'
            className={cn('h-6 p-0', className)}
            {...props}
        />
    )
}

/** The right side: undo/redo, save, share, sidebar toggles. */
function Actions({ className, ...props }: ComponentProps<'div'>) {
    return (
        <div
            data-slot='app-navbar-actions'
            className={cn('ml-auto flex shrink-0 items-center gap-2', className)}
            {...props}
        />
    )
}

export const Navbar = Object.assign(NavbarRoot, {
    Icon,
    Rows,
    Cols,
    Breadcrumbs,
    Title,
    Menubar,
    Actions,
})
