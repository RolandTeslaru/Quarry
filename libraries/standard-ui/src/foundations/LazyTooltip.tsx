import { cloneElement, useState } from 'react'
import { Tooltip } from './Tooltip'

export function LazyTooltip({
    children,
    content,
    asChild = true,
}: {
    children: React.ReactElement
    content: React.ReactNode
    asChild?: boolean
}) {
    const [enabled, setEnabled] = useState(false)
    const triggerProps = {
        onPointerEnter: () => setEnabled(true),
        onTouchStart: () => setEnabled(true),
    } as const
    if (!enabled) {
        // Clone properly using React's API
        return cloneElement(children, triggerProps)
    }
    return (
        <Tooltip.Root>
            <Tooltip.Trigger asChild={asChild}>{cloneElement(children, triggerProps)}</Tooltip.Trigger>
            <Tooltip.Content>{content}</Tooltip.Content>
        </Tooltip.Root>
    )
}
