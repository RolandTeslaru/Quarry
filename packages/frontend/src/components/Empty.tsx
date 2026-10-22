import { NonIdealState, type IconName, type NonIdealStateProps } from '@blueprintjs/core'

interface Props {
    icon:        IconName
    title:       string
    description: string
    action?:     NonIdealStateProps['action']
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
