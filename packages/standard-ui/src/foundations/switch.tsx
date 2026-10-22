import * as SwitchPrimitives from '@radix-ui/react-switch'
import type { ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../utils/cn'

const switchVariants = cva(
    `peer inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors
  border border-border
  focus-visible:outline-hidden
  focus-visible:ring-2
  focus-visible:ring-ring
  focus-visible:ring-offset-2
  focus-visible:ring-offset-background
  disabled:cursor-not-allowed
  disabled:opacity-50
  data-[state=checked]:bg-primary
  data-[state=checked]:border-primary-accent
  data-[state=unchecked]:bg-secondary

  dark:data-[state=unchecked]:bg-input!

  shadow-sm shadow-black/10



  `,
    {
        variants: {
            size: {
                sm: 'h-[12px] w-[20px]',
                md: 'h-[16px] w-[28px]',
                lg: 'h-[24px] w-[44px]',
            },
        },
        defaultVariants: {
            size: 'lg',
        },
    },
)

const switchThumbVariants = cva(
    `pointer-events-none block rounded-full
   bg-input
   dark:bg-secondary
   shadow-lg ring-0
   transition-transform
   data-[state=checked]:bg-white
   dark:data-[state=checked]:bg-white
   `,
    {
        variants: {
            size: {
                sm: 'h-[8px] w-[8px] data-[state=checked]:translate-x-[11px] data-[state=unchecked]:translate-x-[1px]',
                md: 'h-[12px] w-[12px] data-[state=checked]:translate-x-[13px] data-[state=unchecked]:translate-x-[1px]',
                lg: 'h-[20px] w-[20px] data-[state=checked]:translate-x-[21px] data-[state=unchecked]:translate-x-[1px]',
            },
        },
        defaultVariants: {
            size: 'lg',
        },
    },
)

export interface SwitchProps
    extends ComponentProps<typeof SwitchPrimitives.Root>, VariantProps<typeof switchVariants> {}

const Switch = ({ className, size, ...props }: SwitchProps) => (
    <SwitchPrimitives.Root className={cn(switchVariants({ size, className }))} {...props}>
        <SwitchPrimitives.Thumb className={cn(switchThumbVariants({ size }))} />
    </SwitchPrimitives.Root>
)
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
