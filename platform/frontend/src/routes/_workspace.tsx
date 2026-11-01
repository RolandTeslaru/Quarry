import { createFileRoute, Outlet } from '@tanstack/react-router'
import { WorkspaceSidebar } from '@/shell/WorkspaceSidebar'

export const Route = createFileRoute('/_workspace')({
    component: WorkspaceLayout,
})

function WorkspaceLayout() {
    return (
        <div className='flex min-h-screen'>
            <WorkspaceSidebar />

            <div className='min-w-0 flex-1'>
                <main className='h-screen min-w-0 overflow-auto'>
                    <Outlet />
                </main>
            </div>
        </div>
    )
}
