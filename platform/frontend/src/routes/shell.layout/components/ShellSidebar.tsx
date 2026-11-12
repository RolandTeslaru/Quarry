import { useLayoutEffect, useState, type ReactNode } from 'react'
import { Link, type LinkProps } from '@tanstack/react-router'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Select } from '@quarry/standard-ui/foundations/select'
import { Tooltip } from '@quarry/standard-ui/foundations/Tooltip'
import { Icon, type IconName } from '@quarry/standard-ui/icons'
import { cn } from '@quarry/standard-ui/utils/cn'
import { AuthSDK } from '@/SDKs/AuthSDK/sdk'
import { LibrarySDK } from '@/SDKs/LibrarySDK/sdk'
import { useTask } from '@/hooks/useTask'
import { App } from '@/AppKit'
import { ErrorNotice } from '@/components/ErrorNotice'
import { APPS } from './apps'
import { Launchpad } from './Launchpad'
import { applyTheme, readTheme, writeTheme, type Theme } from './preferences'

const NAVIGATION_APPS = APPS.filter(app => app.inNavigation)

// Collapsing only animates the width; everything keeps its position, so icons
// never move. Text fades out at once on collapse, and fades in once the width
// has mostly grown on expand. Below `sm` the sidebar is always the icon strip.
const COLLAPSIBLE = cn(
    'whitespace-nowrap transition-[opacity,visibility] duration-150 delay-100',
    'group-data-[expanded=false]:invisible group-data-[expanded=false]:opacity-0 group-data-[expanded=false]:delay-0',
    'max-sm:invisible max-sm:opacity-0',
)

const SECTION_LABEL = cn(COLLAPSIBLE, 'px-3 py-3 text-[10px] font-semibold tracking-[1.2px] text-muted-foreground')

// Every link's icon sits in a 32px slot (`NavIcon`): app glyphs fill it, 16px icons are
// centred in it. With the sidebar's 8px and the link's 4px padding, every icon is
// centred on the collapsed strip's middle (28px).
const NAV_LINK = cn(
    'flex items-center gap-2 rounded px-1 py-1 text-[13px] text-foreground no-underline',
    'hover:bg-muted hover:text-foreground hover:no-underline',
)

interface ShellSidebarProps {
    expanded: boolean
    onToggle: () => void
}

/** The shell's navigation: a narrow icon strip, expandable to labels and the project list. */
export function ShellSidebar({ expanded, onToggle }: ShellSidebarProps) {
    const [theme, setTheme] = useState(readTheme)

    // Before paint, so a reload never flashes the other theme.
    useLayoutEffect(() => {
        applyTheme(theme)
    }, [theme])

    function changeTheme(next: Theme) {
        setTheme(next)
        writeTheme(next)
    }

    return (
        <aside
            data-expanded={expanded}
            aria-label='Workspace'
            className={cn(
                // The opposite of the page: `.dark` or `.light` here switches the palette for the sidebar only.
                theme === 'light' && 'dark',
                theme === 'dark' && 'light',
                // Opaque, so the page behind doesn't tint it.
                'surface-elevated-sidebar [--material-opacity:100%] rounded-md',
                // Light on a dark page: the light palette's pale grey, not pure white.
                '[.dark_&]:bg-(--surface-content)',
                'group flex h-full w-(--shell-sidebar-width) shrink-0 flex-col overflow-hidden',
                'border-r border-r-separator px-2 pb-3 text-foreground',
                'transition-[width] duration-200 ease-out motion-reduce:transition-none',
            )}
        >
            <div className='mb-6 flex h-14 shrink-0 items-center gap-1.5'>
                <Button
                    variant='minimal'
                    icon='menu'
                    aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
                    aria-expanded={expanded}
                    className='size-10 shrink-0 justify-center text-muted-foreground max-sm:hidden'
                    onClick={onToggle}
                />
                <Brand />
            </div>

            <div className={SECTION_LABEL}>WORKSPACE</div>

            <nav className='flex flex-col gap-0.5'>
                <LaunchpadItem expanded={expanded} />
                {NAVIGATION_APPS.map(app => (
                    <SidebarLink
                        key={app.id}
                        to={app.to}
                        icon={<App.Glyph glyph={app.glyph} size={24} bare />}
                        label={app.label}
                        expanded={expanded}
                    />
                ))}
                <SidebarLink to='/playground' icon={<Icon name='comparison' />} label='UI playground' expanded={expanded} />
            </nav>

            <ProjectList />

            <ThemeSelect theme={theme} onChange={changeTheme} />

            <SidebarFooter />
        </aside>
    )
}

function Brand() {
    return (
        <Link
            to='/library'
            aria-label='Quarry'
            className={cn(COLLAPSIBLE, 'flex min-w-0 flex-1 items-center justify-center pr-[46px] text-foreground no-underline hover:text-foreground hover:no-underline')}
        >
            {/* Centred on the sidebar, not beside the menu button: the right padding matches the button and its gap.
                18px: Spaceman is wide, and the wordmark has to fit that space. */}
            <span className='font-title text-[18px] leading-none'>QUARRY</span>
        </Link>
    )
}

interface NavIconProps {
    children: ReactNode
}

/** A link's 32px icon slot. */
function NavIcon({ children }: NavIconProps) {
    return <span className='flex size-8 shrink-0 items-center justify-center'>{children}</span>
}

interface SidebarLinkProps {
    to:       LinkProps['to']
    icon:     ReactNode
    label:    string
    expanded: boolean
}

/** A navigation link; collapsed, it shows only its icon and names itself in a tooltip. */
function SidebarLink({ to, icon, label, expanded }: SidebarLinkProps) {
    return (
        <Tooltip.Root open={expanded ? false : undefined}>
            <Tooltip.Trigger asChild>
                <Link
                    to={to}
                    aria-label={label}
                    className={NAV_LINK}
                    activeProps={{ className: 'bg-muted font-medium' }}
                >
                    <NavIcon>{icon}</NavIcon>
                    <span className={COLLAPSIBLE}>{label}</span>
                </Link>
            </Tooltip.Trigger>
            <Tooltip.Content side='right'>{label}</Tooltip.Content>
        </Tooltip.Root>
    )
}

interface LaunchpadItemProps {
    expanded: boolean
}

/** Opens the Launchpad; styled like a navigation link. */
function LaunchpadItem({ expanded }: LaunchpadItemProps) {
    return (
        <Tooltip.Root open={expanded ? false : undefined}>
            <Launchpad>
                <Tooltip.Trigger asChild>
                    <button type='button' aria-label='Launchpad' className={cn(NAV_LINK, 'w-full cursor-pointer text-left')}>
                        <NavIcon><Icon name='grid-view' /></NavIcon>
                        <span className={COLLAPSIBLE}>Launchpad</span>
                    </button>
                </Tooltip.Trigger>
            </Launchpad>
            <Tooltip.Content side='right'>Launchpad</Tooltip.Content>
        </Tooltip.Root>
    )
}

function ProjectList() {
    const [projects] = LibrarySDK.useWith(
        LibrarySDK.selectors.projects,
        query => [query.projects],
    )

    return (
        <div className={cn(COLLAPSIBLE, 'flex min-h-0 flex-col')}>
            <div className={cn(SECTION_LABEL, 'mt-8')}>PROJECTS</div>

            <nav className='flex min-h-0 flex-col gap-0.5 overflow-y-auto'>
                {projects.map(project => (
                    <Link
                        key={project.rid}
                        to='/library/$rid'
                        params={{ rid: project.rid }}
                        className={NAV_LINK}
                        activeProps={{ className: 'bg-muted font-medium' }}
                    >
                        <NavIcon><Icon name='folder-close' /></NavIcon>
                        <span className='truncate'>{project.name}</span>
                    </Link>
                ))}

                {projects.length === 0 && (
                    <span className='px-3 py-1 text-xs text-muted-foreground'>Your projects will appear here.</span>
                )}
            </nav>
        </div>
    )
}

const THEMES: { value: Theme; label: string; icon: IconName }[] = [
    { value: 'light', label: 'Light', icon: 'flash' },
    { value: 'dark', label: 'Dark', icon: 'moon' },
]

interface ThemeSelectProps {
    theme:    Theme
    onChange: (theme: Theme) => void
}

/** Light or dark for the whole workspace; remembered per browser, the system's until chosen. */
function ThemeSelect({ theme, onChange }: ThemeSelectProps) {
    function changeTheme(value: string) {
        const next = THEMES.find(option => option.value === value)

        if (!next)
            return

        onChange(next.value)
    }

    return (
        <div className={cn(COLLAPSIBLE, 'mt-auto flex items-center gap-2 px-1.5 pt-5')}>
            <span className='text-xs text-muted-foreground'>Theme</span>
            <Select.Root value={theme} onValueChange={changeTheme}>
                <Select.Trigger size='sm' aria-label='Theme' className='flex-1'>
                    <Select.Value />
                </Select.Trigger>
                <Select.Content>
                    {THEMES.map(option => (
                        <Select.Item key={option.value} value={option.value}>
                            <Icon name={option.icon} />
                            {option.label}
                        </Select.Item>
                    ))}
                </Select.Content>
            </Select.Root>
        </div>
    )
}

function SidebarFooter() {
    const user = AuthSDK.useStore(state => state.user)
    const [task, withTask] = useTask()

    return (
        <>
            <div className='flex items-center gap-2.5 px-1.5 pt-4'>
                <div
                    title={user?.displayName}
                    className='grid size-[30px] shrink-0 place-items-center rounded-full bg-muted text-xs'
                >
                    {user?.displayName.slice(0, 1).toUpperCase() ?? 'Q'}
                </div>
                <div className={cn(COLLAPSIBLE, 'min-w-0 flex-1')}>
                    <div className='truncate text-sm'>{user?.displayName}</div>
                    <div className='text-xs text-muted-foreground'>{user?.workspaceRole}</div>
                </div>
                <Button
                    variant='minimal'
                    icon='log-out'
                    aria-label='Sign out'
                    loading={task.pending}
                    className={cn(COLLAPSIBLE, 'shrink-0 text-muted-foreground')}
                    onClick={withTask(AuthSDK.actions.logout)}
                />
            </div>

            <div className={COLLAPSIBLE}>
                <ErrorNotice error={task.error} />
            </div>
        </>
    )
}
