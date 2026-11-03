import { useState } from 'react'
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { cn } from '@quarry/standard-ui/utils/cn'
import { ShellSidebar } from './components/ShellSidebar'
import { readSidebarExpanded, writeSidebarExpanded } from './components/preferences'

export const Route = createFileRoute('/_shell')({
    component: ShellLayout,
})

// The sidebar floats over the app, which fills the whole viewport. `--shell-sidebar-width` is the
// sidebar's width; App.SafeArea pads by it and the float's inset, so an app's overlay layer stays clear of it.
function ShellLayout() {
    const [expanded, setExpanded] = useState(readSidebarExpanded)

    function toggleSidebar() {
        const next = !expanded

        setExpanded(next)
        writeSidebarExpanded(next)
    }

    return (
        <div
            data-sidebar-expanded={expanded}
            className={cn(
                'relative h-screen',
                '[--shell-sidebar-width:--spacing(58)]',
                'data-[sidebar-expanded=false]:[--shell-sidebar-width:--spacing(14)]',
                'max-sm:[--shell-sidebar-width:--spacing(14)]',
            )}
        >
            <div className='p-2 fixed z-50 top-0 h-screen'>
                <ShellSidebar expanded={expanded} onToggle={toggleSidebar} />
            </div>

            <main className='h-screen min-w-0 overflow-auto'>
                <Outlet />
            </main>
        </div>
    )
}
