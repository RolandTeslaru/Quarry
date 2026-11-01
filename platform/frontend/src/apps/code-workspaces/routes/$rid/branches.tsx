import { createFileRoute } from '@tanstack/react-router'
import { Empty } from '@/components/Empty'

export const Route = createFileRoute('/_workspace/code-workspaces/$rid/branches')({
    component: BranchesTab,
})

function BranchesTab() {
    return (
        <Empty
            icon='git-branch'
            title='No branches yet'
            description='The workspace’s branches — create, switch and compare them. Coming soon.'
        />
    )
}
