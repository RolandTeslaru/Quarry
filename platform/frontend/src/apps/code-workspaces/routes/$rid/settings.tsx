import { createFileRoute } from '@tanstack/react-router'
import { Empty } from '@/components/Empty'

export const Route = createFileRoute('/_workspace/code-workspaces/$rid/settings')({
    component: SettingsTab,
})

function SettingsTab() {
    return (
        <Empty
            icon='cog'
            title='No settings yet'
            description='The workspace’s name, description, template and environment. Coming soon.'
        />
    )
}
