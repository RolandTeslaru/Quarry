import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'
import { cva } from 'class-variance-authority'
import { cn } from '../utils/cn'

const labelVariants = cva('leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', {
    variants: {
        variant: {
            // Inspector field label — small, muted, recedes behind the input value
            default: 'font-medium text-muted-foreground',
            // Accordion / section header — full contrast, dominates the panel
            section: 'font-semibold text-foreground tracking-tight',
            // Inline label (e.g. boolean row, slider row) — small but full contrast
            inline: 'font-medium text-foreground',
            // Uppercase metadata label — Figma/Blender-style inspector heading
            meta: 'font-semibold uppercase tracking-wider text-muted-foreground',
            // Monospaced variant for keys / identifiers
            secondary: 'font-mono text-muted-foreground',
        },
        size: {
            xs: 'text-[10px]',
            sm: 'text-xs',
            md: 'text-sm',
            lg: 'text-base',
        },
    },
    compoundVariants: [
        // Per-variant default sizes — overridden when `size` is passed explicitly
        { variant: 'default', size: undefined, class: 'text-xs' },
        { variant: 'section', size: undefined, class: 'text-sm' },
        { variant: 'inline', size: undefined, class: 'text-xs' },
        { variant: 'meta', size: undefined, class: 'text-[10px]' },
        { variant: 'secondary', size: undefined, class: 'text-xs' },
    ],
    defaultVariants: {
        variant: 'default',
    },
})

type Variant = 'default' | 'section' | 'inline' | 'meta' | 'secondary'
type Size = 'xs' | 'sm' | 'md' | 'lg'

type Props = React.ComponentProps<typeof LabelPrimitive.Root> & {
    variant?: Variant
    size?: Size
    required?: boolean
}

const Label: React.FC<Props> = ({ className, variant, size, children, required = false, ...props }) => (
    <LabelPrimitive.Root className={cn(labelVariants({ variant, size }), className)} {...props}>
        {children}
        {required && <span className='text-red-500 ml-1'>*</span>}
    </LabelPrimitive.Root>
)
Label.displayName = LabelPrimitive.Root.displayName

export { Label }
