import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Popover } from '@quarry/standard-ui/foundations/popover'
import { App } from '@/AppKit'
import { APPS } from './apps'

interface Props {
    /** The trigger, rendered as-is (the sidebar's "Launchpad" item). */
    children: ReactNode
}

/** The Launchpad: every registered app as a grid of tiles, each opening the app's home. */
export function Launchpad({ children }: Props) {
    const [open, setOpen] = useState(false)

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>
                {children}
            </Popover.Trigger>
            <Popover.Content side='right' align='start' sideOffset={12} className='w-80 p-3'>
                <h2 className='px-1 pb-2 text-sm font-semibold'>Launchpad</h2>

                <div className='grid grid-cols-3 gap-1'>
                    {APPS.map(app => (
                        <AppTile key={app.id} app={app} onOpen={() => setOpen(false)} />
                    ))}
                </div>
            </Popover.Content>
        </Popover.Root>
    )
}

interface AppTileProps {
    app:    App.Definition
    onOpen: () => void
}

function AppTile({ app, onOpen }: AppTileProps) {
    return (
        <Link
            to={app.to}
            onClick={onOpen}
            className='flex flex-col items-center gap-2 rounded-md p-3 text-center text-xs text-foreground no-underline hover:bg-muted hover:text-foreground hover:no-underline'
        >
            <App.Glyph glyph={app.glyph} size={44} bare />
            <span className='font-medium'>{app.label}</span>
        </Link>
    )
}
