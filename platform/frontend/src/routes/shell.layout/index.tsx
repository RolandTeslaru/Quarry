import { createFileRoute, Outlet } from '@tanstack/react-router'
import { ShellSidebar } from './components/ShellSidebar'

export const Route = createFileRoute('/_shell')({
    component: ShellLayout,
})

function ShellLayout() {
    return (
        <div className='flex min-h-screen'>
            <div className='p-1 fixed z-50 top-0 h-screen'>
                <ShellSidebar />
            </div>

            <div className='min-w-0 flex-1'>
                <main className='min-w-0 overflow-auto'>
                    <Outlet />
                </main>
            </div>
        </div>
    )
}
