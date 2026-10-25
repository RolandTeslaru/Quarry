import { createFileRoute } from '@tanstack/react-router'
import { Empty } from '@/components/Empty'

export const Route = createFileRoute('/_workspace/code-workspaces/$rid/checks')({
    component: ChecksTab,
})

function ChecksTab() {
    return (
        <Empty
            icon='tick-circle'
            title='No checks yet'
            description='What each commit goes through before it can be built: lint, type checks, tests. Coming soon.'
        />
    )
}
