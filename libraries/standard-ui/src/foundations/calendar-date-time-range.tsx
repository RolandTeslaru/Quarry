'use client'

import { useId, useState } from 'react'

import { Icon } from '../icons'
import { cn } from '../utils/cn'
import { Button } from './button'
import { Calendar } from './calendar'
import { Field } from './fieldLayout'
import { InputGroup, InputGroupAddon, InputGroupInput } from './input-group'
import { Popover } from './popover'
import { Separator } from './separator'

const dateFormatter = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
})

interface CalendarDateTimeRangeValue {
    date?: Date
    startTime: string
    endTime: string
}

interface CalendarDateTimeRangeProps {
    className?: string
    defaultValue?: CalendarDateTimeRangeValue
    disabled?: boolean
    onValueChange?: (value: CalendarDateTimeRangeValue) => void
    placeholder?: string
    value?: CalendarDateTimeRangeValue
}

const DEFAULT_VALUE: CalendarDateTimeRangeValue = {
    startTime: '10:30:00',
    endTime: '12:30:00',
}

function CalendarDateTimeRange({
    className,
    defaultValue,
    disabled = false,
    onValueChange,
    placeholder = 'Pick a date and time',
    value,
}: CalendarDateTimeRangeProps) {
    const id = useId()
    const startTimeId = `${id}-time-from`
    const endTimeId = `${id}-time-to`
    const [internalValue, setInternalValue] = useState<CalendarDateTimeRangeValue>(() => defaultValue ?? DEFAULT_VALUE)
    const selectedValue = value ?? internalValue

    const updateValue = (next: Partial<CalendarDateTimeRangeValue>) => {
        const updated = { ...selectedValue, ...next }
        if (value === undefined) {
            setInternalValue(updated)
        }
        onValueChange?.(updated)
    }

    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                <Button
                    aria-label={placeholder}
                    className={cn('group/pick-date w-60 justify-between', className)}
                    disabled={disabled}
                    id={id}
                    type='button'
                    variant='outlined'
                >
                    <span className={cn('truncate', !selectedValue.date && 'text-muted-foreground')}>
                        {selectedValue.date ? dateFormatter.format(selectedValue.date) : placeholder}
                    </span>
                    <Icon name='calendar'
                        aria-hidden='true'
                        className='text-muted-foreground/80 group-hover/pick-date:text-foreground shrink-0 transition-colors'
                    />
                </Button>
            </Popover.Trigger>

            <Popover.Content align='start' className='w-auto p-0'>
                <Calendar
                    className='p-0'
                    mode='single'
                    onSelect={(date) => updateValue({ date })}
                    selected={selectedValue.date}
                />

                <Separator />

                <Field.Group className='grid grid-cols-2 gap-2.5 p-3'>
                    <Field.Root className='gap-1.5'>
                        <Field.Label htmlFor={startTimeId}>Start Time</Field.Label>
                        <InputGroup>
                            <InputGroupInput
                                className='appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none'
                                id={startTimeId}
                                onChange={(event) => updateValue({ startTime: event.target.value })}
                                step='1'
                                type='time'
                                value={selectedValue.startTime}
                            />
                            <InputGroupAddon>
                                <Icon name='time' />
                            </InputGroupAddon>
                        </InputGroup>
                    </Field.Root>

                    <Field.Root className='gap-1.5'>
                        <Field.Label htmlFor={endTimeId}>End Time</Field.Label>
                        <InputGroup>
                            <InputGroupInput
                                className='appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none'
                                id={endTimeId}
                                onChange={(event) => updateValue({ endTime: event.target.value })}
                                step='1'
                                type='time'
                                value={selectedValue.endTime}
                            />
                            <InputGroupAddon>
                                <Icon name='time' />
                            </InputGroupAddon>
                        </InputGroup>
                    </Field.Root>
                </Field.Group>
            </Popover.Content>
        </Popover.Root>
    )
}

export { CalendarDateTimeRange }
export type { CalendarDateTimeRangeProps, CalendarDateTimeRangeValue }
