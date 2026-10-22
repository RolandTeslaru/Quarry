import type { DialogSDK } from '../sdk'
import { Icon } from '../../../icons'

interface DialogIconProps {
    icon: DialogSDK.Icon
    size?: number
    className?: string
}

export function DialogIcon({ icon, size = 16, className }: DialogIconProps) {
    if (typeof icon === 'string') {
        return <Icon name={icon} size={size} className={className} />
    }

    const Component = icon

    return <Component width={size} height={size} className={className} aria-hidden='true' />
}
