import type { ComponentProps, ReactNode } from 'react'
import { Button as ButtonPrimitive } from '@quarry/standard-ui/foundations/button'
import { ButtonGroup } from '@quarry/standard-ui/foundations/button-group'
import type { IconName } from '@quarry/standard-ui/icons'
import { cn } from '@quarry/standard-ui/utils/cn'

/**
 * A row of tools, each tool or group of tools named underneath: at the top of the content area, under
 * the nav, straight on the background (no panel). It takes the content's grid area, so it's for a page
 * whose content is its background (a canvas), not one with `App.Content`.
 */
function Root({ className, ...props }: ComponentProps<'div'>) {
    return (
        <div
            role='toolbar'
            data-slot='app-toolbar'
            className={cn('flex items-start gap-1 self-start justify-self-start px-1.5 pt-1.5 pb-1 [grid-area:content]', className)}
            {...props}
        />
    )
}

interface GroupProps {
    label:     string
    className?: string
    children:  ReactNode
}

/** Tools that go together (undo and redo): their buttons joined into one control, one name underneath. */
function Group({ label, className, children }: GroupProps) {
    return (
        <div data-slot='app-toolbar-group' className={cn('flex flex-col items-center gap-0.5 px-1', className)}>
            <ButtonGroup aria-label={label}>
                {children}
            </ButtonGroup>
            <span className='text-[11px] whitespace-nowrap text-muted-foreground'>{label}</span>
        </div>
    )
}

interface ButtonProps {
    icon:      IconName
    /** Its name, for screen readers: what shows is the group's name, or the item's. */
    label:     string
    active?:   boolean
    disabled?: boolean
    onClick:   () => void
}

/**
 * One button in a `Group`: just its icon. Solid, so each tool is a tile of its own on the canvas behind;
 * a toggle that's on is filled with the primary colour.
 */
function Button({ icon, label, active, disabled, onClick }: ButtonProps) {
    return (
        <ButtonPrimitive
            variant='solid'
            intent={active ? 'primary' : 'none'}
            size='icon'
            icon={icon}
            aria-label={label}
            aria-pressed={active}
            disabled={disabled}
            onClick={onClick}
        />
    )
}

/** One tool on its own: its button, its name underneath. */
function Item(props: ButtonProps) {
    return (
        <Group label={props.label}>
            <Button {...props} />
        </Group>
    )
}

export const Toolbar = {
    Root,
    Group,
    Item,
    Button,
}
