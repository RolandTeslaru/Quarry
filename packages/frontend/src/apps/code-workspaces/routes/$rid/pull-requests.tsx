import { createFileRoute } from '@tanstack/react-router'
import { Empty } from '@/components/Empty'

export const Route = createFileRoute('/_workspace/code-workspaces/$rid/pull-requests')({
    component: PullRequestsTab,
})

function PullRequestsTab() {
    return (
        <Empty
            icon='git-pull'
            title='No pull requests yet'
            description='Propose a branch’s changes for review, and merge them. Coming soon.'
        />
    )
}
