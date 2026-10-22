import { useState } from 'react'
import { Breadcrumb } from '@quarry/standard-ui/foundations/breadcrumb'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Menubar } from '@quarry/standard-ui/foundations/menubar'
import type { IconName } from '@quarry/standard-ui/icons'
import { App } from '@/AppKit'
import { layoutDemoApp } from './definition'

type Panel = 'outline' | 'search' | 'history'

const PANELS: { id: Panel; label: string; icon: IconName }[] = [
    { id: 'outline', label: 'Outline', icon: 'list' },
    { id: 'search', label: 'Search', icon: 'search' },
    { id: 'history', label: 'History', icon: 'history' },
]

const ROWS = Array.from({ length: 60 }, (_, index) => `Row ${index + 1}`)

/** Test app: every AppKit part with placeholder content, to check the shell and layout. */
export function LayoutDemoApp() {
    const [panel, setPanel] = useState<Panel>('outline')
    const [rightOpen, setRightOpen] = useState(true)
    const [selected, setSelected] = useState(ROWS[0])

    const current = PANELS.find(item => item.id === panel)

    return (
        <App.Root>
            <App.Header>
                <App.Header.Icon icon={layoutDemoApp.icon} />
                <App.Header.Rows>
                    <App.Header.Breadcrumbs>
                        <Breadcrumb.Item>Test apps</Breadcrumb.Item>
                        <Breadcrumb.Separator />
                        <Breadcrumb.Item>
                            <App.Header.Title>Layout demo</App.Header.Title>
                        </Breadcrumb.Item>
                    </App.Header.Breadcrumbs>

                    <App.Header.Menubar>
                        <Menubar.Menu>
                            <Menubar.Trigger>File</Menubar.Trigger>
                            <Menubar.Content>
                                <Menubar.Item disabled>New…</Menubar.Item>
                                <Menubar.Item disabled>Save</Menubar.Item>
                            </Menubar.Content>
                        </Menubar.Menu>
                        <Menubar.Menu>
                            <Menubar.Trigger>View</Menubar.Trigger>
                            <Menubar.Content>
                                <Menubar.Item onSelect={() => setRightOpen(open => !open)}>
                                    {rightOpen ? 'Hide' : 'Show'} details panel
                                </Menubar.Item>
                            </Menubar.Content>
                        </Menubar.Menu>
                    </App.Header.Menubar>
                </App.Header.Rows>

                <App.Header.Actions>
                    <Button icon='share' disabled>Share</Button>
                    <Button
                        variant='minimal'
                        icon='panel-stats'
                        aria-label={rightOpen ? 'Hide details panel' : 'Show details panel'}
                        aria-pressed={rightOpen}
                        onClick={() => setRightOpen(open => !open)}
                    />
                </App.Header.Actions>
            </App.Header>

            <App.LeftNav>
                {PANELS.map(item => (
                    <App.LeftNav.Item
                        key={item.id}
                        icon={item.icon}
                        label={item.label}
                        active={panel === item.id}
                        onSelect={() => setPanel(item.id)}
                    />
                ))}
            </App.LeftNav>

            <App.LeftSidebar>
                <div className='border-b border-border px-4 py-3'>
                    <h2 className='text-sm font-semibold'>{current?.label}</h2>
                    <p className='text-xs text-muted-foreground'>Chosen in the left nav.</p>
                </div>
                <p className='p-4 text-sm text-muted-foreground'>Placeholder for the {current?.label.toLowerCase()} panel.</p>
            </App.LeftSidebar>

            <App.Content>
                <App.Content.Toolbar>
                    <span className='text-sm font-medium'>Content</span>
                    <span className='text-xs text-muted-foreground'>{ROWS.length} rows · scrolls on its own</span>
                </App.Content.Toolbar>

                <ul className='flex flex-col p-4'>
                    {ROWS.map(row => (
                        <li key={row}>
                            <button
                                type='button'
                                className='w-full rounded px-3 py-2 text-left text-sm hover:bg-muted aria-pressed:bg-muted aria-pressed:font-medium'
                                aria-pressed={row === selected}
                                onClick={() => setSelected(row)}
                            >
                                {row}
                            </button>
                        </li>
                    ))}
                </ul>
            </App.Content>

            {rightOpen && (
                <App.RightSidebar>
                    <div className='border-b border-border px-4 py-3'>
                        <h2 className='text-sm font-semibold'>Details</h2>
                        <p className='text-xs text-muted-foreground'>The selection, toggled from the header.</p>
                    </div>
                    <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 p-4 text-sm'>
                        <dt className='text-muted-foreground'>Selected</dt>
                        <dd>{selected}</dd>
                        <dt className='text-muted-foreground'>Panel</dt>
                        <dd>{current?.label}</dd>
                    </dl>
                </App.RightSidebar>
            )}
        </App.Root>
    )
}
