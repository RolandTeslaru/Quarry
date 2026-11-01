import { useState } from 'react'
import {
    Alert,
    Breadcrumbs,
    Button,
    ButtonGroup,
    ContextMenu,
    Dialog,
    DialogBody,
    DialogFooter,
    Drawer,
    DrawerSize,
    InputGroup,
    Menu,
    MenuDivider,
    MenuItem,
    Navbar,
    PopoverNext,
    Tab,
    Tabs,
    Tooltip,
} from '@blueprintjs/core'

function TabsExample() {
    const [tab, setTab] = useState<string | number>('overview')

    return (
        <Tabs id='blueprint-tabs' selectedTabId={tab} onChange={setTab}>
            <Tab id='overview' title='Overview' panel={<p>12,480 rows · Updated 2 minutes ago</p>} />
            <Tab id='schema' title='Schema' panel={<p>customer_id · amount · created_at</p>} />
            <Tab id='history' title='History' panel={<p>Last sync completed successfully.</p>} />
        </Tabs>
    )
}

function MenubarExample() {
    return (
        <Navbar style={{ width: 'fit-content' }}>
            <Navbar.Group>
                <PopoverNext
                    content={
                        <Menu>
                            <MenuItem text='New dataset' />
                            <MenuItem text='Import data' />
                            <MenuDivider />
                            <MenuItem text='Export selection' disabled />
                        </Menu>
                    }
                    placement='bottom-start'
                >
                    <Button variant='minimal'>File</Button>
                </PopoverNext>
                <PopoverNext
                    content={
                        <Menu>
                            <MenuItem text='Undo' />
                            <MenuItem text='Redo' />
                        </Menu>
                    }
                    placement='bottom-start'
                >
                    <Button variant='minimal'>Edit</Button>
                </PopoverNext>
            </Navbar.Group>
        </Navbar>
    )
}

function DropdownExample() {
    const [selection, setSelection] = useState('Choose an action')

    return (
        <div className='demo-stack'>
            <PopoverNext
                placement='bottom-start'
                content={
                    <Menu>
                        <MenuItem text='Rename' onClick={() => setSelection('Rename selected')} />
                        <MenuItem text='Duplicate' onClick={() => setSelection('Duplicate selected')} />
                        <MenuItem text='Export'>
                            <MenuItem text='CSV' onClick={() => setSelection('CSV selected')} />
                            <MenuItem text='Parquet' onClick={() => setSelection('Parquet selected')} />
                        </MenuItem>
                        <MenuDivider />
                        <MenuItem text='Delete' intent='danger' onClick={() => setSelection('Delete selected')} />
                    </Menu>
                }
            >
                <Button>Dataset actions</Button>
            </PopoverNext>
            <p className='demo-note' aria-live='polite'>
                {selection}
            </p>
        </div>
    )
}

function ContextExample() {
    const [selection, setSelection] = useState('Right-click this dataset')

    return (
        <ContextMenu
            content={
                <Menu>
                    <MenuItem text='Open' onClick={() => setSelection('Open selected')} />
                    <MenuItem text='Rename' onClick={() => setSelection('Rename selected')} />
                    <MenuDivider />
                    <MenuItem text='Delete' disabled />
                </Menu>
            }
        >
            <div className='demo-target'>{selection}</div>
        </ContextMenu>
    )
}

function PopoverExample() {
    return (
        <PopoverNext
            placement='bottom'
            content={
                <div className='demo-stack' style={{ width: 256, padding: 16 }}>
                    <strong>Dataset settings</strong>
                    <p className='demo-note'>Compare the opening motion, surface, shadow, and dismissal.</p>
                    <InputGroup aria-label='Popover dataset name' defaultValue='Customers' />
                </div>
            }
        >
            <Button>Open popover</Button>
        </PopoverNext>
    )
}

function TooltipExample() {
    return (
        <div className='demo-line'>
            <Tooltip content='Refresh the dataset schema'>
                <Button>Hover or focus me</Button>
            </Tooltip>
            <Tooltip content='Blueprint manages its own tooltip lifecycle'>
                <Button>Second tooltip</Button>
            </Tooltip>
        </div>
    )
}

function DialogExample() {
    const [open, setOpen] = useState(false)

    return (
        <>
            <Button onClick={() => setOpen(true)}>Open dialog</Button>
            <Dialog isOpen={open} onClose={() => setOpen(false)} title='Create a dataset' style={{ width: 380 }}>
                <DialogBody>
                    <p>Choose a name for your new dataset.</p>
                    <InputGroup aria-label='New dataset name' placeholder='Dataset name' />
                </DialogBody>
                <DialogFooter
                    actions={
                        <>
                            <Button onClick={() => setOpen(false)}>Cancel</Button>
                            <Button intent='primary' onClick={() => setOpen(false)}>
                                Create
                            </Button>
                        </>
                    }
                />
            </Dialog>
        </>
    )
}

function AlertExample() {
    const [open, setOpen] = useState(false)

    return (
        <>
            <Button intent='danger' onClick={() => setOpen(true)}>
                Delete dataset
            </Button>
            <Alert
                isOpen={open}
                onClose={() => setOpen(false)}
                intent='danger'
                icon='trash'
                confirmButtonText='Delete'
                cancelButtonText='Cancel'
            >
                <h3>Delete this dataset?</h3>
                <p>This is a preview. No dataset will be deleted.</p>
            </Alert>
        </>
    )
}

function BottomDrawer() {
    const [open, setOpen] = useState(false)

    return (
        <>
            <Button onClick={() => setOpen(true)}>Open bottom drawer</Button>
            <Drawer
                isOpen={open}
                onClose={() => setOpen(false)}
                title='Dataset details'
                position='bottom'
                size={DrawerSize.SMALL}
            >
                <div style={{ padding: 24 }}>
                    <p>Customer transactions · 12,480 rows</p>
                    <Button onClick={() => setOpen(false)}>Close</Button>
                </div>
            </Drawer>
        </>
    )
}

function SideSheet() {
    const [open, setOpen] = useState(false)

    return (
        <>
            <Button onClick={() => setOpen(true)}>Open side sheet</Button>
            <Drawer isOpen={open} onClose={() => setOpen(false)} title='Dataset details' position='right' size='85%'>
                <p style={{ padding: 24 }}>Customer transactions · 12,480 rows</p>
            </Drawer>
        </>
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
            <PopoverNext
                isOpen={open}
                onInteraction={setOpen}
                content={
                    <ButtonGroup style={{ padding: 12 }}>
                        <Button onClick={() => choose('Sync selected')}>Sync</Button>
                        <Button onClick={() => choose('Export selected')}>Export</Button>
                        <Button onClick={() => setOpen(false)}>Close</Button>
                    </ButtonGroup>
                }
            >
                <Button>Open command bar</Button>
            </PopoverNext>
            <p className='demo-note' aria-live='polite'>
                {selection}
            </p>
        </div>
    )
}

export const blueprintOverlays = {
    tabs: TabsExample,
    breadcrumb: () => (
        <Breadcrumbs
            items={[
                { text: 'Projects', href: '#breadcrumb' },
                { text: 'Analytics', href: '#breadcrumb' },
                { text: 'Customers' },
            ]}
        />
    ),
    menubar: MenubarExample,
    dropdown: DropdownExample,
    context: ContextExample,
    popover: PopoverExample,
    tooltip: TooltipExample,
    dialog: DialogExample,
    alert: AlertExample,
    drawer: BottomDrawer,
    sheet: SideSheet,
    command: CommandExample,
}
