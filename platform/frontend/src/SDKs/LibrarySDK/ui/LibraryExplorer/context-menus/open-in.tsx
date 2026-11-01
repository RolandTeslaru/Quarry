import { ContextMenu } from '@quarry/standard-ui/foundations/contextMenu'
import { Icon } from '@quarry/standard-ui/icons'

interface Props {
    url: string
}

export function OpenInSubMenu({ url }: Props) {
    return (
        <ContextMenu.Sub>
            <ContextMenu.SubTrigger icon={<Icon name='share' />}>
                Open in
            </ContextMenu.SubTrigger>
            <ContextMenu.SubContent>
                <ContextMenu.Item icon={<Icon name='share' />} onSelect={() => window.open(url, '_blank')}>
                    New tab
                </ContextMenu.Item>
                <ContextMenu.Item icon={<Icon name='application' />} onSelect={() => window.open(url, '_blank', 'popup')}>
                    New window
                </ContextMenu.Item>
            </ContextMenu.SubContent>
        </ContextMenu.Sub>
    )
}
