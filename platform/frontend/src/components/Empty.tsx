import type { ReactNode } from 'react'
import { NonIdealState } from '@quarry/standard-ui/foundations/nonIdealState'
import type { IconName } from '@quarry/standard-ui/icons'

interface Props {
    icon:        IconName
    title:       string
    description: string
    action?:     ReactNode
}

export function Empty({ icon, title, description, action }: Props) {
    return (
        <div className='empty'>
            <NonIdealState
                icon={icon}
                title={title}
                description={description}
                action={action}
            />
        </div>
    )
}
