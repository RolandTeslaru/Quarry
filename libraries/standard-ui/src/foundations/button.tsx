import type { ComponentProps, MouseEvent, ReactElement } from 'react'
import { Slot, Slottable } from '@radix-ui/react-slot'
import { Icon, type IconName } from '../icons'
import { cn } from '../utils/cn'
import { Spinner } from './spinner'
import { buttonVariants, type ButtonIntent, type ButtonSize, type ButtonVariant } from './button.styles'

export { buttonVariants, type ButtonIntent, type ButtonSize, type ButtonVariant } from './button.styles'

export type ButtonIcon = IconName | ReactElement | false | null

export interface ButtonProps {
    variant?: ButtonVariant
    intent?: ButtonIntent
    minimal?: boolean
    icon?: ButtonIcon
    endIcon?: ButtonIcon
    size?: ButtonSize
    active?: boolean
    asChild?: boolean
    shouldBounce?: boolean
    loading?: boolean
}

interface IconProps {
    icon: ButtonIcon | undefined
    placement: 'inline-start' | 'inline-end'
}

function ButtonIcon({ icon, placement }: IconProps) {
    if (!icon) {
        return null
    }

    let element = icon

    if (typeof icon === 'string') {
        element = <Icon name={icon} />
    }

    return (
        <span data-icon={placement} aria-hidden='true' className='inline-flex shrink-0 items-center justify-center'>
            {element}
        </span>
    )
}

export function Button({
    className,
    variant = 'solid',
    intent = 'none',
    minimal = false,
    icon,
    endIcon,
    size,
    active,
    asChild = false,
    shouldBounce = true,
    loading = false,
    disabled = false,
    type = 'button',
    onClick,
    onClickCapture,
    children,
    ...props
}: ComponentProps<'button'> & ButtonProps) {
    const Comp = asChild ? Slot : 'button'
    const resolvedVariant = minimal ? 'minimal' : variant
    const hasChildren = children !== undefined && children !== null && children !== false && children !== ''
    const resolvedSize = size ?? (hasChildren ? 'default' : 'icon-sm')
    const isDisabled = disabled || loading

    function handleClickCapture(event: MouseEvent<HTMLButtonElement>) {
        if (isDisabled) {
            event.preventDefault()
            event.stopPropagation()
            return
        }

        onClickCapture?.(event)
    }

    function handleClick(event: MouseEvent<HTMLButtonElement>) {
        if (isDisabled) {
            event.preventDefault()
            event.stopPropagation()
            return
        }

        onClick?.(event)
    }

    return (
        <Comp
            {...props}
            data-slot='button'
            data-variant={resolvedVariant}
            data-intent={intent}
            data-active={active}
            data-loading={loading}
            type={asChild ? undefined : type}
            aria-pressed={active ?? props['aria-pressed']}
            aria-busy={loading || undefined}
            aria-disabled={isDisabled || props['aria-disabled']}
            className={cn(
                buttonVariants({ variant: resolvedVariant, intent, size: resolvedSize }),
                shouldBounce && 'active:scale-[0.95]',
                className,
            )}
            disabled={asChild ? undefined : isDisabled}
            onClick={handleClick}
            onClickCapture={handleClickCapture}
        >
            {loading && <Spinner aria-hidden='true' className='size-4' elementClassName='fill-current!' />}
            {!loading && <ButtonIcon icon={icon} placement='inline-start' />}
            <Slottable>{children}</Slottable>
            {!loading && <ButtonIcon icon={endIcon} placement='inline-end' />}
        </Comp>
    )
}
