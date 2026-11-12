import { createContext, useContext, type ComponentProps } from 'react'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Tooltip } from '@quarry/standard-ui/foundations/Tooltip'
import type { IconName } from '@quarry/standard-ui/icons'
import { cn } from '@quarry/standard-ui/utils/cn'
import { Overlay as OverlayKit } from '@/components/overlay'
import type { Definition } from './definition'

const AppContext = createContext<Definition | null>(null)

/** The app this is rendered in — its definition, from `App.Root`. */
export function useApp(): Definition {
    const app = useContext(AppContext)

    if (!app)
        throw new Error('useApp needs an App.Root above it — the app\'s layout route (routes/route.tsx)')

    return app
}

interface RootProps extends ComponentProps<'div'> {
    app: Definition
}

/**
 * The app itself: rendered once, by the app's layout route (`routes/route.tsx`),
 * around every page of the app — so moving between them keeps it mounted.
 * Provides the app's definition (`App.useApp`).
 *
 * It fills the whole viewport, under the shell's sidebar, and is the app's
 * background layer: a page renders its background here, then its `Overlay`.
 */
export function Root({ app, className, ...props }: RootProps) {
    return (
        <AppContext.Provider value={app}>
            <div
                data-slot='app'
                className={cn('relative isolate h-full min-h-0 [--app-nav-height:--spacing(12)]', className)}
                {...props}
            />
        </AppContext.Provider>
    )
}

/** The app's background layer — a colour, a graph canvas: the whole viewport, under the shell's sidebar and the overlay. */
export function Background({ className, ...props }: ComponentProps<'div'>) {
    return (
        <div
            data-slot='app-background'
            className={cn('absolute inset-0', className)}
            {...props}
        />
    )
}

/**
 * Keeps what it holds clear of the shell's sidebar, which floats over the app:
 * padded by `--shell-sidebar-width`, the sidebar's inset and the gap
 * between panels, so it moves as the sidebar expands. A background around it still reaches under the sidebar.
 */
export function SafeArea({ className, ...props }: ComponentProps<'div'>) {
    return (
        <div
            data-slot='app-safe-area'
            className={cn(
                'pl-[calc(var(--shell-sidebar-width)+var(--surface-gap)*2)] transition-[padding] duration-200 ease-out motion-reduce:transition-none',
                className,
            )}
            {...props}
        />
    )
}

/**
 * The app's overlay layer, in a SafeArea above its background. Its grid: the nav
 * floats across the top; below it, left to right: LeftSidebar · Content · RightSidebar.
 * The sidebars stay put; only the content scrolls, from the top edge, passing under the nav.
 * A page renders the parts it fills; they place themselves by grid area, so any can
 * be left out and its column collapses: the sidebars carry the gap beside the content, as a
 * grid gap would stay around an empty column. Clicks outside the parts reach the background.
 */
export function Overlay({ className, ...props }: ComponentProps<'div'>) {
    return (
        <SafeArea
            data-slot='app-overlay'
            className={cn(
                `pointer-events-none relative grid h-full min-h-0 gap-y-surface-gap pr-surface-gap *:pointer-events-auto
                grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[auto_minmax(0,1fr)]
                [grid-template-areas:'nav_nav_nav'_'left_content_right']`,
                className,
            )}
            {...props}
        />
    )
}

/** Icon strip choosing what the left sidebar shows — vertical tabs, along the sidebar's left edge. */
function LeftNavRoot({ className, ...props }: ComponentProps<'nav'>) {
    return (
        <nav
            data-slot='app-left-nav'
            className={cn('flex w-12 shrink-0 flex-col items-center gap-1 border-r py-2', className)}
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

/** A floating panel at the left, scrolling on its own. With a left nav, it's a row: the nav, then what it selects. */
export function LeftSidebar({ className, ...props }: ComponentProps<'div'>) {
    return (
        <OverlayKit.Panel
            data-slot='app-left-sidebar'
            className={cn('mr-surface-gap mb-surface-gap flex min-h-0 flex-col overflow-y-auto [grid-area:left]', className)}
            {...props}
        />
    )
}

/** Properties or details of the selection, toggled from the nav; a floating panel at the right. */
export function RightSidebar({ className, ...props }: ComponentProps<'div'>) {
    return (
        <OverlayKit.Panel
            data-slot='app-right-sidebar'
            className={cn('mb-surface-gap ml-surface-gap min-h-0 w-80 overflow-y-auto [grid-area:right]', className)}
            {...props}
        />
    )
}

/**
 * The main view, over the background between the sidebars. It runs the overlay's full
 * height and is padded clear of the nav, so it starts below the nav and scrolls up under it.
 */
function ContentRoot({ className, ...props }: ComponentProps<'main'>) {
    return (
        <main
            data-slot='app-content'
            className={cn(
                `col-[content] row-span-full flex min-h-0 min-w-0 flex-col overflow-auto
                pt-[calc(var(--app-nav-height)+var(--surface-gap)*2)]`,
                className,
            )}
            {...props}
        />
    )
}

/** The heading of a page or tab inside the app's content. */
function ContentTitle({ className, ...props }: ComponentProps<'h2'>) {
    return (
        <h2
            data-slot='app-content-title'
            className={cn('text-2xl font-semibold tracking-tight text-foreground', className)}
            {...props}
        />
    )
}

/** A toolbar pinned to the top of the content: sticky offsets start inside the padding, so just below the nav. */
function ContentToolbar({ className, ...props }: ComponentProps<'div'>) {
    return (
        <div
            data-slot='app-content-toolbar'
            className={cn('surface-panel sticky top-0 z-10 flex h-10 shrink-0 items-center gap-2 border-b px-4', className)}
            {...props}
        />
    )
}

export const Content = Object.assign(ContentRoot, {
    Title: ContentTitle,
    Toolbar: ContentToolbar,
})
