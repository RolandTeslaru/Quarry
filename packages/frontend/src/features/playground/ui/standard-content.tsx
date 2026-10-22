import { useState } from 'react'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Card } from '@quarry/standard-ui/foundations/card'
import { Frame } from '@quarry/standard-ui/foundations/frame'
import { Accordion } from '@quarry/standard-ui/foundations/accordion'
import { Table } from '@quarry/standard-ui/foundations/table'
import { List } from '@quarry/standard-ui/foundations/list'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@quarry/standard-ui/foundations/item'
import { ScrollArea } from '@quarry/standard-ui/foundations/scrollArea'
import { Separator } from '@quarry/standard-ui/foundations/separator'
import { DraggabeList, type DragEndEvent } from '@quarry/standard-ui/foundations/draggableList'
import { Badge } from '@quarry/standard-ui/foundations/Badge'
import { Avatar, AvatarFallback, AvatarGroup } from '@quarry/standard-ui/foundations/avatar'
import { Text, BooleanText } from '@quarry/standard-ui/foundations/Text'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Skeleton } from '@quarry/standard-ui/foundations/skeleton'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@quarry/standard-ui/foundations/empty'
import { DateInput } from '@quarry/standard-ui/foundations/DateInput'
import { Calendar } from '@quarry/standard-ui/foundations/calendar'
import { CalendarRange } from '@quarry/standard-ui/foundations/calendar-range'
import { CalendarDateTimeRange } from '@quarry/standard-ui/foundations/calendar-date-time-range'

const referenceDate = new Date(2026, 9, 22)
const referenceRange = { from: new Date(2026, 9, 15), to: referenceDate }

function CardExample() {
    return (
        <Card.Root className='max-w-80'>
            <Card.Header>
                <Card.Title>Customer transactions</Card.Title>
                <Card.Description>Production / Analytics</Card.Description>
            </Card.Header>
            <Card.Content>12,480 rows · 8 columns</Card.Content>
            <Card.Footer>
                <Button intent='primary'>Open dataset</Button>
            </Card.Footer>
        </Card.Root>
    )
}

function FrameExample() {
    return (
        <Frame.Root className='max-w-80'>
            <Frame.Header>
                <Frame.Title>Dataset settings</Frame.Title>
                <Frame.Description>Manage sync behavior</Frame.Description>
            </Frame.Header>
            <Frame.Panel>Sync every 30 minutes</Frame.Panel>
            <Frame.Footer>
                <Button>Configure sync</Button>
            </Frame.Footer>
        </Frame.Root>
    )
}

function AccordionExample() {
    return (
        <Accordion.Root type='single' collapsible defaultValue='details'>
            <Accordion.Item value='details'>
                <Accordion.Trigger>Dataset details</Accordion.Trigger>
                <Accordion.Content>12,480 rows · 8 columns · Parquet</Accordion.Content>
            </Accordion.Item>
            <Accordion.Item value='schedule'>
                <Accordion.Trigger>Sync schedule</Accordion.Trigger>
                <Accordion.Content>Every 30 minutes, Monday through Friday.</Accordion.Content>
            </Accordion.Item>
        </Accordion.Root>
    )
}

function TableExample() {
    return (
        <Table.Root>
            <Table.Header>
                <Table.Row>
                    <Table.Head>Dataset</Table.Head>
                    <Table.Head>Rows</Table.Head>
                    <Table.Head>Status</Table.Head>
                </Table.Row>
            </Table.Header>
            <Table.Body>
                <Table.Row>
                    <Table.Cell>Customers</Table.Cell>
                    <Table.Cell>12,480</Table.Cell>
                    <Table.Cell>Ready</Table.Cell>
                </Table.Row>
                <Table.Row>
                    <Table.Cell>Transactions</Table.Cell>
                    <Table.Cell>84,210</Table.Cell>
                    <Table.Cell>Syncing</Table.Cell>
                </Table.Row>
                <Table.Row>
                    <Table.Cell>Products</Table.Cell>
                    <Table.Cell>1,206</Table.Cell>
                    <Table.Cell>Ready</Table.Cell>
                </Table.Row>
            </Table.Body>
        </Table.Root>
    )
}

function ScrollExample() {
    return (
        <ScrollArea.Root className='demo-scroll'>
            {Array.from({ length: 15 }, (_, index) => (
                <div key={index} className='demo-scroll-row'>
                    Dataset partition {index + 1}
                </div>
            ))}
        </ScrollArea.Root>
    )
}

function DragExample() {
    const [items, setItems] = useState([
        { id: 'customers', name: 'Customers', group: 'incoming' },
        { id: 'orders', name: 'Orders', group: 'incoming' },
    ])

    function moveItem(event: DragEndEvent) {
        if (!event.over) {
            return
        }

        const destination = String(event.over.id)

        if (destination !== 'incoming' && destination !== 'ready') {
            return
        }

        setItems((current) =>
            current.map((item) => (item.id === event.active.id ? { ...item, group: destination } : item)),
        )
    }

    return (
        <DraggabeList.Root onDragEnd={moveItem}>
            <div className='grid grid-cols-2 gap-3'>
                {['incoming', 'ready'].map((group) => (
                    <DraggabeList.Group key={group} id={group} className='min-h-36 rounded-lg'>
                        <DraggabeList.Header name={group === 'incoming' ? 'Incoming' : 'Ready'} color='#ff6a00' />
                        <DraggabeList.Items>
                            {items
                                .filter((item) => item.group === group)
                                .map((item, index) => (
                                    <DraggabeList.Item
                                        key={item.id}
                                        id={item.id}
                                        name={item.name}
                                        index={index}
                                        parent={group}
                                    />
                                ))}
                        </DraggabeList.Items>
                    </DraggabeList.Group>
                ))}
            </div>
        </DraggabeList.Root>
    )
}

function EmptyExample() {
    const [created, setCreated] = useState(false)

    return (
        <Empty>
            <EmptyHeader>
                <EmptyTitle>{created ? 'Dataset created' : 'No datasets yet'}</EmptyTitle>
                <EmptyDescription>
                    {created
                        ? 'Your preview dataset is ready.'
                        : 'Connect a source to bring your first dataset into this project.'}
                </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
                <Button intent='primary' onClick={() => setCreated(!created)}>
                    {created ? 'Reset preview' : 'Connect a source'}
                </Button>
            </EmptyContent>
        </Empty>
    )
}

function DateExample() {
    const [date, setDate] = useState(referenceDate)

    return <DateInput value={date} onChange={setDate} />
}

function CalendarExample() {
    const [date, setDate] = useState<Date | undefined>(referenceDate)

    return <Calendar mode='single' selected={date} onSelect={setDate} defaultMonth={referenceDate} />
}

export const standardContent = {
    card: CardExample,
    frame: FrameExample,
    accordion: AccordionExample,
    table: TableExample,
    list: () => (
        <List.Root>
            <List.Item>Customers</List.Item>
            <List.Item>Transactions</List.Item>
            <List.Item>Products</List.Item>
        </List.Root>
    ),
    item: () => (
        <Item variant='outline'>
            <ItemContent>
                <ItemTitle>Customer transactions</ItemTitle>
                <ItemDescription>Updated 2 minutes ago · 12,480 rows</ItemDescription>
            </ItemContent>
            <Button>Open</Button>
        </Item>
    ),
    scroll: ScrollExample,
    separator: () => (
        <div className='demo-stack'>
            <span>Dataset details</span>
            <Separator />
            <span>Sync settings</span>
        </div>
    ),
    drag: DragExample,
    badge: () => (
        <div className='demo-line'>
            <Badge>Default</Badge>
            <Badge variant='secondary'>Secondary</Badge>
            <Badge variant='destructive'>Failed</Badge>
            <Badge variant='outline'>Outline</Badge>
        </div>
    ),
    avatar: () => (
        <AvatarGroup>
            <Avatar>
                <AvatarFallback>RT</AvatarFallback>
            </Avatar>
            <Avatar>
                <AvatarFallback>AM</AvatarFallback>
            </Avatar>
            <Avatar>
                <AvatarFallback>+3</AvatarFallback>
            </Avatar>
        </AvatarGroup>
    ),
    text: () => (
        <div className='demo-stack'>
            <Text>Customer transactions</Text>
            <Text variant='secondary'>Last updated 2 minutes ago</Text>
            <div className='demo-line'>
                <BooleanText value />
                <BooleanText value={false} />
                <BooleanText value affirmative />
            </div>
        </div>
    ),
    spinner: () => (
        <div className='demo-line'>
            <Spinner className='size-4' />
            <Spinner className='size-6' />
            <Spinner className='size-9' />
        </div>
    ),
    skeleton: () => (
        <div className='demo-stack'>
            <Skeleton className='h-5 w-48' />
            <Skeleton className='h-4 w-64' />
            <Skeleton className='h-4 w-40' />
        </div>
    ),
    empty: EmptyExample,
    date: DateExample,
    calendar: CalendarExample,
    'calendar-range': () => <CalendarRange defaultValue={referenceRange} />,
    'date-time': () => (
        <CalendarDateTimeRange defaultValue={{ date: referenceDate, startTime: '10:30:00', endTime: '12:30:00' }} />
    ),
}
