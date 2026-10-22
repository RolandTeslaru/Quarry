import { useState } from 'react'
import enUS from 'date-fns/locale/en-US'
import {
    Button,
    Card,
    Classes,
    Collapse,
    Divider,
    EntityTitle,
    HTMLTable,
    Menu,
    MenuItem,
    NonIdealState,
    Spinner,
    Tag,
    Text,
} from '@blueprintjs/core'
import { DateInput, DatePicker, DateRangeInput, TimePrecision, type DateRange } from '@blueprintjs/datetime'

const referenceDate = new Date(2026, 9, 22)
const referenceRange: DateRange = [new Date(2026, 9, 15), referenceDate]

function formatDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function parseDate(value: string): Date | false {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)

    if (!match) {
        return false
    }

    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))

    return formatDate(date) === value ? date : false
}

function CardExample() {
    return (
        <Card style={{ maxWidth: 320 }}>
            <h4>Customer transactions</h4>
            <p className='demo-note'>Production / Analytics</p>
            <p style={{ marginTop: 16 }}>12,480 rows · 8 columns</p>
            <Button intent='primary'>Open dataset</Button>
        </Card>
    )
}

function FrameExample() {
    return (
        <Card style={{ maxWidth: 320 }}>
            <h4>Dataset settings</h4>
            <p className='demo-note'>Manage sync behavior</p>
            <Card style={{ margin: '12px 0' }}>Sync every 30 minutes</Card>
            <Button>Configure sync</Button>
        </Card>
    )
}

function AccordionExample() {
    const [details, setDetails] = useState(true)
    const [schedule, setSchedule] = useState(false)

    return (
        <div className='demo-stack'>
            <Button
                variant='minimal'
                endIcon={details ? 'chevron-up' : 'chevron-down'}
                onClick={() => setDetails(!details)}
            >
                Dataset details
            </Button>
            <Collapse isOpen={details}>12,480 rows · 8 columns · Parquet</Collapse>
            <Divider />
            <Button
                variant='minimal'
                endIcon={schedule ? 'chevron-up' : 'chevron-down'}
                onClick={() => setSchedule(!schedule)}
            >
                Sync schedule
            </Button>
            <Collapse isOpen={schedule}>Every 30 minutes, Monday through Friday.</Collapse>
        </div>
    )
}

function TableExample() {
    return (
        <HTMLTable striped interactive style={{ width: '100%' }}>
            <thead>
                <tr>
                    <th>Dataset</th>
                    <th>Rows</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Customers</td>
                    <td>12,480</td>
                    <td>Ready</td>
                </tr>
                <tr>
                    <td>Transactions</td>
                    <td>84,210</td>
                    <td>Syncing</td>
                </tr>
                <tr>
                    <td>Products</td>
                    <td>1,206</td>
                    <td>Ready</td>
                </tr>
            </tbody>
        </HTMLTable>
    )
}

function ScrollExample() {
    return (
        <div className='demo-scroll' tabIndex={0} aria-label='Dataset partitions'>
            {Array.from({ length: 15 }, (_, index) => (
                <div key={index} className='demo-scroll-row'>
                    Dataset partition {index + 1}
                </div>
            ))}
        </div>
    )
}

function EmptyExample() {
    const [created, setCreated] = useState(false)

    return (
        <NonIdealState
            icon={created ? 'tick-circle' : 'database'}
            title={created ? 'Dataset created' : 'No datasets yet'}
            description={
                created
                    ? 'Your preview dataset is ready.'
                    : 'Connect a source to bring your first dataset into this project.'
            }
            action={
                <Button intent='primary' onClick={() => setCreated(!created)}>
                    {created ? 'Reset preview' : 'Connect a source'}
                </Button>
            }
        />
    )
}

function DateExample() {
    return (
        <DateInput
            locale={enUS}
            defaultValue={referenceDate.toISOString()}
            formatDate={formatDate}
            parseDate={parseDate}
            placeholder='YYYY-MM-DD'
        />
    )
}

function CalendarExample() {
    const [date, setDate] = useState<Date | null>(referenceDate)

    return <DatePicker locale={enUS} value={date} onChange={setDate} initialMonth={referenceDate} />
}

function DateRangeExample() {
    return <DateRangeInput locale={enUS} defaultValue={referenceRange} formatDate={formatDate} parseDate={parseDate} />
}

function DateTimeExample() {
    return (
        <DateRangeInput
            locale={enUS}
            defaultValue={referenceRange}
            formatDate={(date) =>
                `${formatDate(date)} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            }
            parseDate={(value) => {
                const date = new Date(value)
                return Number.isNaN(date.getTime()) ? false : date
            }}
            timePrecision={TimePrecision.MINUTE}
        />
    )
}

export const blueprintContent = {
    card: CardExample,
    frame: FrameExample,
    accordion: AccordionExample,
    table: TableExample,
    list: () => (
        <Menu>
            <MenuItem icon='database' text='Customers' />
            <MenuItem icon='database' text='Transactions' />
            <MenuItem icon='database' text='Products' />
        </Menu>
    ),
    item: () => (
        <Card style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1 }}>
                <strong>Customer transactions</strong>
                <p className='demo-note'>Updated 2 minutes ago · 12,480 rows</p>
            </div>
            <Button>Open</Button>
        </Card>
    ),
    scroll: ScrollExample,
    separator: () => (
        <div className='demo-stack'>
            <span>Dataset details</span>
            <Divider />
            <span>Sync settings</span>
        </div>
    ),
    drag: () => (
        <Card>
            <p>Blueprint has no built-in draggable list.</p>
            <p className='demo-note'>
                This requires a drag-and-drop library, such as the dnd-kit implementation used on the left.
            </p>
        </Card>
    ),
    badge: () => (
        <div className='demo-line'>
            <Tag>Default</Tag>
            <Tag minimal>Secondary</Tag>
            <Tag intent='danger'>Failed</Tag>
            <Tag minimal intent='primary'>
                Outline
            </Tag>
        </div>
    ),
    avatar: () => (
        <div className='demo-stack'>
            <EntityTitle icon='user' title='Roland Teslaru' subtitle='Workspace member' />
            <p className='demo-note'>
                EntityTitle is the closest built-in identity display; Blueprint has no avatar group.
            </p>
        </div>
    ),
    text: () => (
        <div className='demo-stack'>
            <Text>Customer transactions</Text>
            <Text className={Classes.TEXT_MUTED}>Last updated 2 minutes ago</Text>
            <div className='demo-line'>
                <Tag minimal intent='success'>
                    true
                </Tag>
                <Tag minimal intent='danger'>
                    false
                </Tag>
                <Tag minimal intent='success'>
                    YES
                </Tag>
            </div>
        </div>
    ),
    spinner: () => (
        <div className='demo-line'>
            <Spinner size={16} />
            <Spinner size={24} />
            <Spinner size={36} />
        </div>
    ),
    skeleton: () => (
        <div className='demo-stack'>
            <div className={Classes.SKELETON} style={{ height: 20, width: 192 }} />
            <div className={Classes.SKELETON} style={{ height: 16, width: 256 }} />
            <div className={Classes.SKELETON} style={{ height: 16, width: 160 }} />
        </div>
    ),
    empty: EmptyExample,
    date: DateExample,
    calendar: CalendarExample,
    'calendar-range': DateRangeExample,
    'date-time': DateTimeExample,
}
