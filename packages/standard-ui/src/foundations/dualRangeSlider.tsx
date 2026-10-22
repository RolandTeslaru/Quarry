'use client'

import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '../utils/cn'
import { rootVars, trackVars, thumbVars, rangeVars, type SliderVariants } from './slider'

interface DualRangeSliderProps extends React.ComponentProps<typeof SliderPrimitive.Root> {
    labelPosition?: 'top' | 'bottom'
    label?: (value: number | undefined) => React.ReactNode
    variant?: SliderVariants
}

const DualRangeSlider = React.forwardRef<React.ComponentRef<typeof SliderPrimitive.Root>, DualRangeSliderProps>(
    ({ className, label, variant, labelPosition = 'top', ...props }, ref) => {
        const initialValue = Array.isArray(props.value) ? props.value : [props.min, props.max]

        return (
            <SliderPrimitive.Root ref={ref} className={cn(rootVars({ variant }), className)} {...props}>
                <SliderPrimitive.Track className={cn(trackVars({ variant }))}>
                    <SliderPrimitive.Range className={cn(rangeVars({ variant }))} />
                </SliderPrimitive.Track>
                {initialValue.map((value, index) => (
                    <SliderPrimitive.Thumb key={index} className={cn(thumbVars({ variant }))}>
                        {label && (
                            <span
                                className={cn(
                                    'absolute flex w-full justify-center',
                                    labelPosition === 'top' && '-top-7',
                                    labelPosition === 'bottom' && 'top-4',
                                )}
                            >
                                {label(value)}
                            </span>
                        )}
                    </SliderPrimitive.Thumb>
                ))}
            </SliderPrimitive.Root>
        )
    },
)
DualRangeSlider.displayName = 'DualRangeSlider'

export { DualRangeSlider }
