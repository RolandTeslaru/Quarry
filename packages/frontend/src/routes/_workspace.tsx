import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Icon } from '@quarry/standard-ui/icons'
import { AuthSDK } from '@/SDKs/AuthSDK/sdk'
import { LibrarySDK } from '@/SDKs/LibrarySDK/sdk'
import { useTask } from '@/hooks/useTask'
import { ErrorNotice } from '@/components/ErrorNotice'

export const Route = createFileRoute('/_workspace')({
    component: WorkspaceLayout,
})

function WorkspaceLayout() {
    const user = AuthSDK.useStore(state => state.user)
    const [projects] = LibrarySDK.useWith(
        LibrarySDK.selectors.projects,
        query => [query.projects],
    )

    const task = useTask()

    return (
        <div className='workspace'>
            <aside className='sidebar dark'>
                <Link to='/library' className='brand'>
                    <div className='brand-mark'>Q</div>
                    <span>Quarry</span>
                    <span className='brand-badge'>LOCAL</span>
                </Link>

                <div className='sidebar-label'>WORKSPACE</div>

                <nav className='sidebar-nav'>
                    <Link to='/library' activeProps={{ className: 'active' }}>
                        <Icon name='projects' />
                        Projects &amp; data
                    </Link>
                    <Link to='/keychain' activeProps={{ className: 'active' }}>
                        <Icon name='key' />
                        Keychain
                    </Link>
                    <Link to='/playground'>
                        <Icon name='comparison' />
                        UI playground
                    </Link>
                </nav>

                <div className='sidebar-label mt-8'>PROJECTS</div>

                <nav className='sidebar-nav project-nav'>
                    {projects.map(project => (
                        <Link
                            key={project.rid}
                            to='/resources/$rid'
                            params={{ rid: project.rid }}
                            activeProps={{ className: 'active' }}
                        >
                            <Icon name='folder-close' />
                            <span className='truncate'>{project.name}</span>
                        </Link>
                    ))}

                    {projects.length === 0 && (
                        <span className='sidebar-note'>Your projects will appear here.</span>
                    )}
                </nav>

                <div className='sidebar-footer'>
                    <div className='user-avatar'>{user?.displayName.slice(0, 1).toUpperCase() ?? 'Q'}</div>
                    <div className='min-w-0 flex-1'>
                        <div className='truncate text-sm'>{user?.displayName}</div>
                        <div className='text-xs text-slate-400'>{user?.workspaceRole}</div>
                    </div>
                    <Button
                        variant='minimal'
                        icon='log-out'
                        aria-label='Sign out'
                        loading={task.pending}
                        onClick={() => void task.run(AuthSDK.actions.logout)}
                    />
                </div>

                <ErrorNotice error={task.error} />
            </aside>

            <div className='workspace-content'>
                <div className='workspace-topbar'>
                    <span>Workspace</span>
                    <span className='flex items-center gap-2'>
                        <span className='status-dot' />
                        Self-hosted
                    </span>
                </div>

                <main className='page-content'>
                    <Outlet />
                </main>
            </div>
        </div>
    )
}
