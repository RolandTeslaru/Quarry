import type { ComponentProps, ReactElement, ReactNode } from 'react'
import { Icon, type IconName } from '../icons'
import { cn } from '../utils/cn'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from './empty'

const DEFAULT_ICON_SIZE = 48

export type NonIdealStateIcon = IconName | ReactElement | false | null

export interface NonIdealStateProps extends Omit<ComponentProps<'div'>, 'title'> {
    icon?: NonIdealStateIcon
    iconMuted?: boolean
    iconSize?: number
    title?: ReactNode
    description?: ReactNode
    action?: ReactNode
    layout?: 'vertical' | 'horizontal'
}

export function NonIdealState({
    icon,
    iconMuted = true,
    iconSize = DEFAULT_ICON_SIZE,
    title,
    description,
    action,
    layout = 'vertical',
    className,
    children,
    ...props
}: NonIdealStateProps) {
    const horizontal = layout === 'horizontal'
    const hasTitle = title != null && title !== false
    const hasDescription = description != null && description !== false
    const hasAction = action != null && action !== false
    const hasChildren = children != null && children !== false
    let visual: ReactNode = icon

    if (typeof icon === 'string') {
        visual = <Icon name={icon} size={iconSize} />
    }

    return (
        <Empty
            {...props}
            data-slot='non-ideal-state'
            data-layout={layout}
            className={cn(
                'min-h-64 gap-5',
                horizontal && 'flex-row text-left',
                className,
            )}
        >
            {visual && (
                <div
                    className='non-ideal-state-icon shrink-0 text-muted-foreground'
                    data-muted={iconMuted}
                    style={{ width: iconSize, height: iconSize }}
                    aria-hidden='true'
                    inert
                >
                    {visual}
                </div>
            )}

            {(hasTitle || hasDescription || hasAction || hasChildren) && (
                <div className={cn('flex min-w-0 max-w-sm flex-col gap-5', horizontal && 'flex-1')}>
                    {(hasTitle || hasDescription) && (
                        <EmptyHeader className={horizontal ? 'items-start' : undefined}>
                            {hasTitle && <EmptyTitle className='text-base font-semibold'>{title}</EmptyTitle>}
                            {hasDescription && <EmptyDescription>{description}</EmptyDescription>}
                        </EmptyHeader>
                    )}

                    {hasAction && (
                        <EmptyContent className={horizontal ? 'items-start' : undefined}>
                            {action}
                        </EmptyContent>
                    )}

                    {children}
                </div>
            )}
        </Empty>
    )
}
