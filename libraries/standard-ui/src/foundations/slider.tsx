import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { type ComponentProps, type FC } from 'react'

import { cn } from '../utils/cn'
import { cva } from 'class-variance-authority'

export const rootVars = cva(
    'relative flex w-full touch-none select-none items-center data-[disabled]:opacity-50  data-[orientation=vertical]:min-h-40',
    {
        variants: {
            variant: {
                default: '',
                primary: '',
            },
        },
    },
)

export const trackVars = cva(
    `relative shadow-sm shadow-black/10 bg-secondary grow overflow-hidden rounded-full ring-1 ring-inset ring-border
   data-[orientation=horizontal]:h-2.5
   data-[orientation=horizontal]:w-full
   data-[orientation=vertical]:h-full
   data-[orientation=vertical]:w-2.5`,
    {
        variants: {
            variant: {
                default: '',
                primary: '',
            },
        },
    },
)

export const rangeVars = cva(
    `absolute select-none
   data-[orientation=horizontal]:h-full
   data-[orientation=vertical]:w-full`,
    {
        variants: {
            variant: {
                default: 'bg-muted-foreground/40',
                primary: 'bg-primary',
            },
        },
    },
)

export const thumbVars = cva(
    'cursor-pointer relative block h-2.5 w-2.5 rounded-full bg-white border border-neutral-300 shrink-0 select-none ring-offset-background transition-[color,box-shadow] after:absolute after:-inset-2 hover:ring-[3px] hover:ring-ring/50 focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50 active:ring-[3px] active:ring-ring/50 data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
    {
        variants: {
            variant: {
                default: '',
                primary: '',
            },
        },
    },
)

export type SliderVariants = 'default' | 'primary'

const THUMB_SIZE = 12 // matches w-3 (12px)

const Slider = ({
    className,
    defaultValue,
    value,
    min = 0,
    max = 100,
    onDragStart,
    onDragEnd,
    variant = 'default',
    onValueChange,
    ...props
}: Omit<ComponentProps<typeof SliderPrimitive.Root>, 'onDragStart' | 'onDragEnd'> & {
    onDragStart?: (event: React.PointerEvent<HTMLSpanElement>) => void
    onDragEnd?: (event: React.PointerEvent<HTMLSpanElement>) => void
    variant?: SliderVariants
}) => {
    const fillRef = React.useRef<HTMLDivElement>(null)

    const values = value ?? defaultValue ?? [min, max]

    const computeFillWidth = React.useCallback(
        (val: number) => {
            const pct = Math.min(100, Math.max(0, ((val - min) / (max - min)) * 100))
            const offset = THUMB_SIZE / 2 - pct * (THUMB_SIZE / 100)
            return `calc(${pct}% + ${offset}px)`
        },
        [min, max],
    )

    const handleValueChange = (vals: number[]) => {
        if (fillRef.current) {
            fillRef.current.style.width = computeFillWidth(vals[0])
        }
        onValueChange?.(vals)
    }

    React.useEffect(() => {
        if (fillRef.current && value !== undefined) {
            const v = value[0] ?? min
            fillRef.current.style.width = computeFillWidth(v)
        }
    }, [value, computeFillWidth])

    const initialValue = values[0] ?? min

    const handlePointerDown = (event: React.PointerEvent<HTMLSpanElement>) => {
        onDragStart?.(event)
    }

    const handlePointerUp = (event: React.PointerEvent<HTMLSpanElement>) => {
        onDragEnd?.(event)
    }

    return (
        <SliderPrimitive.Root
            data-slot='slider'
            defaultValue={defaultValue}
            value={value}
            min={min}
            max={max}
            className={cn(rootVars({ variant }), className)}
            onValueChange={handleValueChange}
            {...props}
        >
            <SliderPrimitive.Track data-slot='slider-track' className={cn(trackVars({ variant }))}>
                <SliderPrimitive.Range data-slot='slider-range' className='sr-only' />
                <div
                    ref={fillRef}
                    className={cn(
                        'absolute left-0 top-0 h-full pointer-events-none select-none',
                        variant === 'primary' && 'bg-primary',
                        variant === 'default' && 'bg-muted-foreground/40',
                    )}
                    style={{ width: computeFillWidth(initialValue) }}
                />
            </SliderPrimitive.Track>
            {Array.from({ length: values.length }, (_, index) => (
                <SliderPrimitive.Thumb
                    data-slot='slider-thumb'
                    key={index}
                    className={cn(thumbVars({ variant }))}
                    onPointerDown={handlePointerDown}
                    onPointerUp={handlePointerUp}
                />
            ))}
        </SliderPrimitive.Root>
    )
}
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
