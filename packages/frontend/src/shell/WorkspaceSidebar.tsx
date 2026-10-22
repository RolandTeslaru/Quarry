import { useState } from 'react'
import { Link, type LinkProps } from '@tanstack/react-router'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Tooltip } from '@quarry/standard-ui/foundations/Tooltip'
import { Icon, type IconName } from '@quarry/standard-ui/icons'
import { cn } from '@quarry/standard-ui/utils/cn'
import { AuthSDK } from '@/SDKs/AuthSDK/sdk'
import { LibrarySDK } from '@/SDKs/LibrarySDK/sdk'
import { useTask } from '@/hooks/useTask'
import { ErrorNotice } from '@/components/ErrorNotice'
import { APPS } from './apps'
import { AppLauncher } from './AppLauncher'
import { readSidebarExpanded, writeSidebarExpanded } from './sidebar-preference'

const NAVIGATION_APPS = APPS.filter(app => app.inNavigation)

// Collapsing only animates the width; everything keeps its position, so icons
// never move. Text fades out at once on collapse, and fades in once the width
// has mostly grown on expand. Below `sm` the sidebar is always the icon strip.
const COLLAPSIBLE = cn(
    'whitespace-nowrap transition-[opacity,visibility] duration-150 delay-100',
    'group-data-[expanded=false]:invisible group-data-[expanded=false]:opacity-0 group-data-[expanded=false]:delay-0',
    'max-sm:invisible max-sm:opacity-0',
)

const SECTION_LABEL = cn(COLLAPSIBLE, 'px-3 py-3 text-[10px] font-semibold tracking-[1.2px] text-[#8393a5]')

const NAV_LINK = cn(
    'flex items-center gap-2.5 rounded px-3 py-2.5 text-[13px] text-white no-underline',
    'hover:bg-[#304153] hover:text-white hover:no-underline',
)

/** The shell's navigation: a narrow icon strip, expandable to labels and the project list. */
export function WorkspaceSidebar() {
    const [expanded, setExpanded] = useState(readSidebarExpanded)

    function toggle() {
        const next = !expanded

        setExpanded(next)
        writeSidebarExpanded(next)
    }

    return (
        <aside
            data-expanded={expanded}
            aria-label='Workspace'
            className={cn(
                'dark group sticky top-0 flex h-screen w-58 shrink-0 flex-col overflow-hidden',
                'bg-[#1c2835] px-2 pb-3 text-white',
                'transition-[width] duration-200 ease-out motion-reduce:transition-none',
                'data-[expanded=false]:w-14 max-sm:w-14',
            )}
        >
            <div className='mb-6 flex h-14 shrink-0 items-center gap-1.5'>
                <Button
                    variant='minimal'
                    icon='menu'
                    aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
                    aria-expanded={expanded}
                    className='size-10 shrink-0 justify-center text-[#b5c3d1] max-sm:hidden'
                    onClick={toggle}
                />
                <Brand />
            </div>

            <div className={SECTION_LABEL}>WORKSPACE</div>

            <nav className='flex flex-col gap-0.5'>
                <AppsItem expanded={expanded} />
                {NAVIGATION_APPS.map(app => (
                    <SidebarLink
                        key={app.id}
                        to={app.to}
                        icon={app.icon}
                        label={app.label}
                        expanded={expanded}
                    />
                ))}
                <SidebarLink to='/playground' icon='comparison' label='UI playground' expanded={expanded} />
            </nav>

            <ProjectList />

            <SidebarFooter />
        </aside>
    )
}

function Brand() {
    return (
        <Link
            to='/library'
            aria-label='Quarry'
            className={cn(COLLAPSIBLE, 'flex min-w-0 flex-1 items-center gap-2.5 text-white no-underline hover:text-white hover:no-underline')}
        >
            <div className='grid h-9 w-[34px] shrink-0 place-items-center rounded-[3px_3px_10px_3px] bg-[#328b73] text-2xl font-semibold'>
                Q
            </div>
            <span className='text-[21px] font-semibold'>Quarry</span>
            <span className='ml-auto rounded-[3px] border border-[#435261] px-[5px] py-[3px] text-[9px] tracking-[0.8px] text-[#a4b3c3]'>
                LOCAL
            </span>
        </Link>
    )
}

interface SidebarLinkProps {
    to:       LinkProps['to']
    icon:     IconName
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
                    activeProps={{ className: 'bg-[#304153]' }}
                >
                    <Icon name={icon} className='shrink-0' />
                    <span className={COLLAPSIBLE}>{label}</span>
                </Link>
            </Tooltip.Trigger>
            <Tooltip.Content side='right'>{label}</Tooltip.Content>
        </Tooltip.Root>
    )
}

interface AppsItemProps {
    expanded: boolean
}

/** Opens the app launcher; styled like a navigation link. */
function AppsItem({ expanded }: AppsItemProps) {
    return (
        <Tooltip.Root open={expanded ? false : undefined}>
            <AppLauncher>
                <Tooltip.Trigger asChild>
                    <button type='button' aria-label='Applications' className={cn(NAV_LINK, 'w-full cursor-pointer text-left')}>
                        <Icon name='grid-view' className='shrink-0' />
                        <span className={COLLAPSIBLE}>Applications</span>
                    </button>
                </Tooltip.Trigger>
            </AppLauncher>
            <Tooltip.Content side='right'>Applications</Tooltip.Content>
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
                        to='/resources/$rid'
                        params={{ rid: project.rid }}
                        className={NAV_LINK}
                        activeProps={{ className: 'bg-[#304153]' }}
                    >
                        <Icon name='folder-close' className='shrink-0' />
                        <span className='truncate'>{project.name}</span>
                    </Link>
                ))}

                {projects.length === 0 && (
                    <span className='px-3 py-1 text-xs text-[#8e9dad]'>Your projects will appear here.</span>
                )}
            </nav>
        </div>
    )
}

function SidebarFooter() {
    const user = AuthSDK.useStore(state => state.user)
    const task = useTask()

    return (
        <>
            <div className='mt-auto flex items-center gap-2.5 px-1.5 pt-5'>
                <div
                    title={user?.displayName}
                    className='grid size-[30px] shrink-0 place-items-center rounded-full bg-[#405367] text-xs'
                >
                    {user?.displayName.slice(0, 1).toUpperCase() ?? 'Q'}
                </div>
                <div className={cn(COLLAPSIBLE, 'min-w-0 flex-1')}>
                    <div className='truncate text-sm'>{user?.displayName}</div>
                    <div className='text-xs text-slate-400'>{user?.workspaceRole}</div>
                </div>
                <Button
                    variant='minimal'
                    icon='log-out'
                    aria-label='Sign out'
                    loading={task.pending}
                    className={cn(COLLAPSIBLE, 'shrink-0 text-[#b5c3d1]')}
                    onClick={() => void task.run(AuthSDK.actions.logout)}
                />
            </div>

            <div className={COLLAPSIBLE}>
                <ErrorNotice error={task.error} />
            </div>
        </>
    )
}
