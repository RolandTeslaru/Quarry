import { useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Badge } from '@quarry/standard-ui/foundations/Badge'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Callout } from '@quarry/standard-ui/foundations/callout'
import { Checkbox } from '@quarry/standard-ui/foundations/checkbox'
import { Dialog } from '@quarry/standard-ui/foundations/dialog'
import { DropdownMenu } from '@quarry/standard-ui/foundations/dropdownMenu'
import { Input } from '@quarry/standard-ui/foundations/input'
import { NonIdealState } from '@quarry/standard-ui/foundations/nonIdealState'
import { Popover } from '@quarry/standard-ui/foundations/popover'
import { Select } from '@quarry/standard-ui/foundations/select'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Switch } from '@quarry/standard-ui/foundations/switch'
import { Table } from '@quarry/standard-ui/foundations/table'
import { Tabs } from '@quarry/standard-ui/foundations/tabs'
import { Tooltip } from '@quarry/standard-ui/foundations/Tooltip'
import { followVsCodeTheme } from '../theme'

/**
 * Test bench: standard-ui's components mounted in a VS Code panel webview —
 * styling, dark mode, icons, and overlays (portals) inside the webview's box.
 */
function ComponentsBench() {
    const [picked, setPicked] = useState('Nothing picked yet')

    return (
        <main className='flex flex-col gap-6 p-4 text-sm text-foreground'>
            <Section title='Buttons'>
                <Button intent='primary' icon='play'>Preview</Button>
                <Button icon='build'>Build</Button>
                <Button intent='success' icon='add'>New dataset</Button>
                <Button intent='danger' icon='trash'>Delete</Button>
                <Button variant='minimal' icon='refresh' aria-label='Refresh' />
                <Button loading>Running</Button>
                <Button disabled>Disabled</Button>
            </Section>

            <Section title='Inputs'>
                <Input className='w-56' placeholder='Dataset name' />
                <Select.Root defaultValue='sample'>
                    <Select.Trigger className='w-48' aria-label='Input strategy'>
                        <Select.Value />
                    </Select.Trigger>
                    <Select.Content>
                        <Select.Item value='sample'>Sample (1,000 rows)</Select.Item>
                        <Select.Item value='full'>Full dataset</Select.Item>
                        <Select.Item value='filter'>Filter…</Select.Item>
                    </Select.Content>
                </Select.Root>
                <label className='flex items-center gap-2'><Checkbox defaultChecked /> Include nulls</label>
                <label className='flex items-center gap-2'><Switch defaultChecked size='md' /> Auto-run on save</label>
            </Section>

            <Section title='Tabs'>
                <Tabs.Root defaultValue='output' className='w-full'>
                    <Tabs.List className='w-fit'>
                        <Tabs.Trigger value='output'>Output</Tabs.Trigger>
                        <Tabs.Trigger value='logs'>Logs</Tabs.Trigger>
                        <Tabs.Trigger value='schema'>Schema</Tabs.Trigger>
                    </Tabs.List>
                    <Tabs.Content value='output'>8 columns · 1,000 rows</Tabs.Content>
                    <Tabs.Content value='logs'>Sampled 1,000 rows from claims_raw</Tabs.Content>
                    <Tabs.Content value='schema'>claim_id · policy_id · date · claim_value</Tabs.Content>
                </Tabs.Root>
            </Section>

            <Section title='Overlays (portals inside the webview)'>
                <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                        <Button endIcon='caret-down'>Dataset actions</Button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content>
                        <DropdownMenu.Item onSelect={() => setPicked('Use as input')}>Use as input</DropdownMenu.Item>
                        <DropdownMenu.Item onSelect={() => setPicked('Use as output')}>Use as output</DropdownMenu.Item>
                        <DropdownMenu.Separator />
                        <DropdownMenu.Item onSelect={() => setPicked('Open in Quarry')}>Open in Quarry</DropdownMenu.Item>
                    </DropdownMenu.Content>
                </DropdownMenu.Root>

                <Popover.Root>
                    <Popover.Trigger asChild>
                        <Button>Popover</Button>
                    </Popover.Trigger>
                    <Popover.Content sideOffset={8} className='w-64 p-4'>
                        <strong>Input strategy</strong>
                        <p className='text-muted-foreground'>How much of the input a preview reads.</p>
                    </Popover.Content>
                </Popover.Root>

                <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                        <Button icon='info-sign'>Tooltip</Button>
                    </Tooltip.Trigger>
                    <Tooltip.Content>Reads a sample of each input</Tooltip.Content>
                </Tooltip.Root>

                <Dialog.Root>
                    <Dialog.Trigger asChild>
                        <Button>Dialog</Button>
                    </Dialog.Trigger>
                    <Dialog.Content>
                        <Dialog.Header>
                            <Dialog.Title>Build output</Dialog.Title>
                            <Dialog.Description>Builds write a new transaction to each output.</Dialog.Description>
                        </Dialog.Header>
                        <Dialog.Footer>
                            <Dialog.Close asChild>
                                <Button>Close</Button>
                            </Dialog.Close>
                        </Dialog.Footer>
                    </Dialog.Content>
                </Dialog.Root>

                <span className='text-muted-foreground'>{picked}</span>
            </Section>

            <Section title='Feedback'>
                <Badge>Default</Badge>
                <Badge variant='secondary'>Sample</Badge>
                <Badge variant='destructive'>Failed</Badge>
                <Badge variant='outline'>master</Badge>
                <Spinner className='size-5' />
                <Callout intent='primary' title='Preview'>Results are calculated from sample inputs.</Callout>
                <Callout intent='danger' title='The transform raised'>KeyError: 'claim_value'</Callout>
            </Section>

            <Section title='Table'>
                <Table.Root>
                    <Table.Header>
                        <Table.Row>
                            <Table.Head>claim_id</Table.Head>
                            <Table.Head>state</Table.Head>
                            <Table.Head className='text-right'>claim_value</Table.Head>
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {[['d0a020f9', 'Maine', '9,737.34'], ['f36cdfd8', 'Indiana', '5,305.21'], ['3652f9bf', 'Kentucky', '3,501.11']].map(([id, state, value]) => (
                            <Table.Row key={id}>
                                <Table.Cell className='font-mono'>{id}</Table.Cell>
                                <Table.Cell>{state}</Table.Cell>
                                <Table.Cell className='text-right'>{value}</Table.Cell>
                            </Table.Row>
                        ))}
                    </Table.Body>
                </Table.Root>
            </Section>

            <Section title='Empty state'>
                <NonIdealState
                    icon='th'
                    title='Quarry Explorer'
                    description='Select a dataset to view information'
                />
            </Section>
        </main>
    )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className='flex flex-col gap-2'>
            <h3 className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>{title}</h3>
            <div className='flex flex-wrap items-center gap-2'>{children}</div>
        </section>
    )
}

followVsCodeTheme()
createRoot(document.getElementById('root')!).render(<ComponentsBench />)
