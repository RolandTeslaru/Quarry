'use client'

import { useId, useMemo, useState } from 'react'
import type { DateRange } from 'react-day-picker'

import { SystemIcons } from '../icons'
import { cn } from '../utils/cn'
import { Button } from './button'
import { Calendar } from './calendar'
import { Card } from './card'
import { Popover } from './popover'

const dateFormatter = new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
})

function addDays(date: Date, amount: number) {
    const result = new Date(date)
    result.setDate(result.getDate() + amount)
    return result
}

function startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatRange(range: DateRange | undefined, placeholder: string) {
    if (!range?.from) {
        return placeholder
    }

    const from = dateFormatter.format(range.from)
    return range.to ? `${from} - ${dateFormatter.format(range.to)}` : from
}

interface CalendarRangeProps {
    className?: string
    defaultValue?: DateRange
    disabled?: boolean
    maxDate?: Date
    onValueChange?: (value: DateRange | undefined) => void
    placeholder?: string
    value?: DateRange
}

interface DatePreset {
    label: string
    range: DateRange
}

function CalendarRange({
    className,
    defaultValue,
    disabled = false,
    maxDate,
    onValueChange,
    placeholder = 'Pick a date range',
    value,
}: CalendarRangeProps) {
    const id = useId()
    const [today] = useState(() => startOfDay(new Date()))

    const presets = useMemo<DatePreset[]>(() => {
        const previousMonth = today.getMonth() - 1
        const previousYear = today.getFullYear() - 1

        return [
            { label: 'Today', range: { from: today, to: today } },
            {
                label: 'Yesterday',
                range: { from: addDays(today, -1), to: addDays(today, -1) },
            },
            {
                label: 'Last 7 days',
                range: { from: addDays(today, -6), to: today },
            },
            {
                label: 'Last 30 days',
                range: { from: addDays(today, -29), to: today },
            },
            {
                label: 'Month to date',
                range: {
                    from: new Date(today.getFullYear(), today.getMonth(), 1),
                    to: today,
                },
            },
            {
                label: 'Last month',
                range: {
                    from: new Date(today.getFullYear(), previousMonth, 1),
                    to: new Date(today.getFullYear(), today.getMonth(), 0),
                },
            },
            {
                label: 'Year to date',
                range: { from: new Date(today.getFullYear(), 0, 1), to: today },
            },
            {
                label: 'Last year',
                range: {
                    from: new Date(previousYear, 0, 1),
                    to: new Date(previousYear, 11, 31),
                },
            },
        ]
    }, [today])

    const [internalValue, setInternalValue] = useState<DateRange | undefined>(() => defaultValue ?? presets[2]?.range)
    const selectedValue = value ?? internalValue
    const [month, setMonth] = useState(() => selectedValue?.from ?? selectedValue?.to ?? today)

    const selectRange = (range: DateRange | undefined) => {
        if (value === undefined) {
            setInternalValue(range)
        }
        onValueChange?.(range)
    }

    const selectPreset = (range: DateRange) => {
        selectRange(range)
        setMonth(range.to ?? range.from ?? today)
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
                    <span className={cn('truncate', !selectedValue?.from && 'text-muted-foreground')}>
                        {formatRange(selectedValue, placeholder)}
                    </span>
                    <SystemIcons.Calendar
                        aria-hidden='true'
                        className='text-muted-foreground/80 group-hover/pick-date:text-foreground shrink-0 transition-colors'
                    />
                </Button>
            </Popover.Trigger>

            <Popover.Content align='start' className='w-auto p-0'>
                <Card.Root className='p-0'>
                    <Card.Content className='p-0'>
                        <div className='flex max-sm:flex-col'>
                            <div className='relative py-4 max-sm:order-1 max-sm:border-t sm:w-32'>
                                <div className='h-full sm:border-e'>
                                    <div className='flex flex-col px-2'>
                                        {presets.map(({ label, range }) => (
                                            <Button
                                                className='w-full justify-start'
                                                key={label}
                                                onClick={() => selectPreset(range)}
                                                shouldBounce={false}
                                                size='sm'
                                                type='button'
                                                variant='minimal'
                                            >
                                                {label}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <Calendar
                                disabled={maxDate ? [{ after: maxDate }] : undefined}
                                mode='range'
                                month={month}
                                onMonthChange={setMonth}
                                onSelect={selectRange}
                                selected={selectedValue}
                            />
                        </div>
                    </Card.Content>
                </Card.Root>
            </Popover.Content>
        </Popover.Root>
    )
}

export { CalendarRange }
export type { CalendarRangeProps }
