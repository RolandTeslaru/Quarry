import { useState } from 'react'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Input } from '@quarry/standard-ui/foundations/input'
import { Tabs } from '@quarry/standard-ui/foundations/tabs'
import { Breadcrumb } from '@quarry/standard-ui/foundations/breadcrumb'
import { Menubar } from '@quarry/standard-ui/foundations/menubar'
import { DropdownMenu } from '@quarry/standard-ui/foundations/dropdownMenu'
import { ContextMenu } from '@quarry/standard-ui/foundations/contextMenu'
import { Popover } from '@quarry/standard-ui/foundations/popover'
import { Tooltip } from '@quarry/standard-ui/foundations/Tooltip'
import { LazyTooltip } from '@quarry/standard-ui/foundations/LazyTooltip'
import { Drawer } from '@quarry/standard-ui/foundations/drawer'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@quarry/standard-ui/foundations/sheet'
import { StandardDialogs, StandardAlerts } from './StandardDialogs'
import { CommandBar, CommandBarBar, CommandBarCommand } from '@quarry/standard-ui/foundations/commandBar'

function TabsExample() {
    return (
        <Tabs.Root defaultValue='overview'>
            <Tabs.List className='w-fit'>
                <Tabs.Trigger value='overview'>Overview</Tabs.Trigger>
                <Tabs.Trigger value='schema'>Schema</Tabs.Trigger>
                <Tabs.Trigger value='history'>History</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value='overview'>12,480 rows · Updated 2 minutes ago</Tabs.Content>
            <Tabs.Content value='schema'>customer_id · amount · created_at</Tabs.Content>
            <Tabs.Content value='history'>Last sync completed successfully.</Tabs.Content>
        </Tabs.Root>
    )
}

function BreadcrumbExample() {
    return (
        <Breadcrumb.Root>
            <Breadcrumb.List>
                <Breadcrumb.Item>
                    <Breadcrumb.Link href='#breadcrumb'>Projects</Breadcrumb.Link>
                </Breadcrumb.Item>
                <Breadcrumb.Separator />
                <Breadcrumb.Item>
                    <Breadcrumb.Link href='#breadcrumb'>Analytics</Breadcrumb.Link>
                </Breadcrumb.Item>
                <Breadcrumb.Separator />
                <Breadcrumb.Item>
                    <Breadcrumb.Page>Customers</Breadcrumb.Page>
                </Breadcrumb.Item>
            </Breadcrumb.List>
        </Breadcrumb.Root>
    )
}

function MenubarExample() {
    return (
        <Menubar.Root>
            <Menubar.Menu>
                <Menubar.Trigger>File</Menubar.Trigger>
                <Menubar.Content>
                    <Menubar.Item>New dataset</Menubar.Item>
                    <Menubar.Item>Import data</Menubar.Item>
                    <Menubar.Separator />
                    <Menubar.Item disabled>Export selection</Menubar.Item>
                </Menubar.Content>
            </Menubar.Menu>
            <Menubar.Menu>
                <Menubar.Trigger>Edit</Menubar.Trigger>
                <Menubar.Content>
                    <Menubar.Item>Undo</Menubar.Item>
                    <Menubar.Item>Redo</Menubar.Item>
                </Menubar.Content>
            </Menubar.Menu>
        </Menubar.Root>
    )
}

function DropdownExample() {
    const [selection, setSelection] = useState('Choose an action')

    return (
        <div className='demo-stack'>
            <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                    <Button>Dataset actions</Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content>
                    <DropdownMenu.Item onSelect={() => setSelection('Rename selected')}>Rename</DropdownMenu.Item>
                    <DropdownMenu.Item onSelect={() => setSelection('Duplicate selected')}>Duplicate</DropdownMenu.Item>
                    <DropdownMenu.Sub>
                        <DropdownMenu.SubTrigger>Export</DropdownMenu.SubTrigger>
                        <DropdownMenu.SubContent>
                            <DropdownMenu.Item onSelect={() => setSelection('CSV selected')}>CSV</DropdownMenu.Item>
                            <DropdownMenu.Item onSelect={() => setSelection('Parquet selected')}>
                                Parquet
                            </DropdownMenu.Item>
                        </DropdownMenu.SubContent>
                    </DropdownMenu.Sub>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item variant='destructive' onSelect={() => setSelection('Delete selected')}>
                        Delete
                    </DropdownMenu.Item>
                </DropdownMenu.Content>
            </DropdownMenu.Root>
            <p className='demo-note' aria-live='polite'>
                {selection}
            </p>
        </div>
    )
}

function ContextExample() {
    const [selection, setSelection] = useState('Right-click this dataset')

    return (
        <ContextMenu.Root>
            <ContextMenu.Trigger>
                <div className='demo-target'>{selection}</div>
            </ContextMenu.Trigger>
            <ContextMenu.Content>
                <ContextMenu.Item onSelect={() => setSelection('Open selected')}>Open</ContextMenu.Item>
                <ContextMenu.Item onSelect={() => setSelection('Rename selected')}>Rename</ContextMenu.Item>
                <ContextMenu.Separator />
                <ContextMenu.Item disabled>Delete</ContextMenu.Item>
            </ContextMenu.Content>
        </ContextMenu.Root>
    )
}

function PopoverExample() {
    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                <Button>Open popover</Button>
            </Popover.Trigger>
            <Popover.Content sideOffset={8} className='w-64 p-4'>
                <div className='demo-stack'>
                    <strong>Dataset settings</strong>
                    <p className='demo-note'>Compare the opening motion, surface, shadow, and dismissal.</p>
                    <Input aria-label='Popover dataset name' defaultValue='Customers' />
                </div>
            </Popover.Content>
        </Popover.Root>
    )
}

function TooltipExample() {
    return (
        <div className='demo-line'>
            <Tooltip.Root>
                <Tooltip.Trigger asChild>
                    <Button>Hover or focus me</Button>
                </Tooltip.Trigger>
                <Tooltip.Content>Refresh the dataset schema</Tooltip.Content>
            </Tooltip.Root>
            <LazyTooltip content='Mounted on first interaction'>
                <Button>Lazy tooltip</Button>
            </LazyTooltip>
        </div>
    )
}

function DrawerExample() {
    return (
        <Drawer.Root>
            <Drawer.Trigger asChild>
                <Button>Open bottom drawer</Button>
            </Drawer.Trigger>
            <Drawer.Content>
                <Drawer.Header>
                    <Drawer.Title>Dataset details</Drawer.Title>
                    <Drawer.Description>A bottom drawer with the current standard-ui motion.</Drawer.Description>
                </Drawer.Header>
                <Drawer.Body>
                    <p className='demo-note'>Customer transactions · 12,480 rows</p>
                </Drawer.Body>
                <Drawer.Footer>
                    <Drawer.Close asChild>
                        <Button>Close</Button>
                    </Drawer.Close>
                </Drawer.Footer>
            </Drawer.Content>
        </Drawer.Root>
    )
}

function SheetExample() {
    return (
        <Sheet>
            <SheetTrigger asChild>
                <Button>Open side sheet</Button>
            </SheetTrigger>
            <SheetContent>
                <SheetHeader>
                    <SheetTitle>Dataset details</SheetTitle>
                    <SheetDescription>Customer transactions · 12,480 rows</SheetDescription>
                </SheetHeader>
            </SheetContent>
        </Sheet>
    )
}

function CommandExample() {
    const [open, setOpen] = useState(false)
    const [selection, setSelection] = useState('')

    function choose(command: string) {
        setSelection(command)
        setOpen(false)
    }

    return (
        <div className='demo-stack'>
            <Button onClick={() => setOpen(true)}>Open command bar</Button>
            <CommandBar open={open} onOpenChange={setOpen}>
                <CommandBarBar>
                    <CommandBarCommand
                        action={() => choose('Sync selected')}
                        label='Sync'
                        shortcut={{ shortcut: 'S' }}
                    />
                    <CommandBarCommand
                        action={() => choose('Export selected')}
                        label='Export'
                        shortcut={{ shortcut: 'E' }}
                    />
                    <CommandBarCommand action={() => setOpen(false)} label='Close' shortcut={{ shortcut: 'Esc' }} />
                </CommandBarBar>
            </CommandBar>
            <p className='demo-note' aria-live='polite'>
                {selection}
            </p>
        </div>
    )
}

export const standardOverlays = {
    tabs: TabsExample,
    breadcrumb: BreadcrumbExample,
    menubar: MenubarExample,
    dropdown: DropdownExample,
    context: ContextExample,
    popover: PopoverExample,
    tooltip: TooltipExample,
    dialog: StandardDialogs,
    alert: StandardAlerts,
    drawer: DrawerExample,
    sheet: SheetExample,
    command: CommandExample,
}
