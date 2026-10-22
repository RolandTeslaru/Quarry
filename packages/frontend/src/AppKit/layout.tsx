import type { ComponentProps } from 'react'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Tooltip } from '@quarry/standard-ui/foundations/Tooltip'
import type { IconName } from '@quarry/standard-ui/icons'
import { cn } from '@quarry/standard-ui/utils/cn'

// One shell measure: 56px (Tailwind `14`) is the collapsed workspace sidebar's width,
// the left nav's width, the header's height and the header's icon square.

/**
 * The app's grid. The header spans the top; below it, left to right:
 * LeftNav · LeftSidebar · Content · RightSidebar. Parts place themselves by grid
 * area, so any of them can be left out and its column collapses.
 */
export function Root({ className, ...props }: ComponentProps<'div'>) {
    return (
        <div
            data-slot='app'
            className={cn(
                `grid h-full min-h-0
                grid-cols-[auto_auto_minmax(0,1fr)_auto] grid-rows-[auto_minmax(0,1fr)]
                [grid-template-areas:'header_header_header_header'_'nav_left_content_right']`,
                className,
            )}
            {...props}
        />
    )
}

/** Icon strip choosing what the left sidebar shows — vertical tabs. */
function LeftNavRoot({ className, ...props }: ComponentProps<'nav'>) {
    return (
        <nav
            data-slot='app-left-nav'
            className={cn('surface flex w-14 flex-col items-center gap-1 border-r py-2 [grid-area:nav]', className)}
            {...props}
        />
    )
}

interface LeftNavItemProps {
    icon:      IconName
    label:     string
    active?:   boolean
    disabled?: boolean
    onSelect:  () => void
}

/** One tab in the left nav: an icon button, named in a tooltip. */
function LeftNavItem({ icon, label, active = false, disabled = false, onSelect }: LeftNavItemProps) {
    return (
        <Tooltip.Root>
            {/* The span triggers the tooltip: a disabled button gets no pointer events. */}
            <Tooltip.Trigger asChild>
                <span className='inline-flex'>
                    <Button
                        variant='minimal'
                        icon={icon}
                        aria-label={label}
                        aria-pressed={active}
                        disabled={disabled}
                        className={cn('size-10 justify-center', active && 'bg-muted text-foreground')}
                        onClick={onSelect}
                    />
                </span>
            </Tooltip.Trigger>
            <Tooltip.Content side='right'>{label}</Tooltip.Content>
        </Tooltip.Root>
    )
}

export const LeftNav = Object.assign(LeftNavRoot, {
    Item: LeftNavItem,
})

/** The panel the left nav selects. */
export function LeftSidebar({ className, ...props }: ComponentProps<'aside'>) {
    return (
        <aside
            data-slot='app-left-sidebar'
            className={cn('surface min-h-0 w-72 overflow-y-auto border-r [grid-area:left]', className)}
            {...props}
        />
    )
}

/** Properties or details of the selection, toggled from the header. */
export function RightSidebar({ className, ...props }: ComponentProps<'aside'>) {
    return (
        <aside
            data-slot='app-right-sidebar'
            className={cn('surface min-h-0 w-80 overflow-y-auto border-l [grid-area:right]', className)}
            {...props}
        />
    )
}

/** The main view, on the same surface as the header and sidebars. Scrolls on its own; they stay put. */
function ContentRoot({ className, ...props }: ComponentProps<'main'>) {
    return (
        <main
            data-slot='app-content'
            className={cn('surface flex min-h-0 min-w-0 flex-col overflow-auto [grid-area:content]', className)}
            {...props}
        />
    )
}

/** A toolbar pinned to the top of the content. */
function ContentToolbar({ className, ...props }: ComponentProps<'div'>) {
    return (
        <div
            data-slot='app-content-toolbar'
            className={cn('surface sticky top-0 z-10 flex h-10 shrink-0 items-center gap-2 border-b px-4', className)}
            {...props}
        />
    )
}

export const Content = Object.assign(ContentRoot, {
    Toolbar: ContentToolbar,
})
