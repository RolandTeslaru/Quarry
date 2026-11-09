import type { Foundations } from '@quarry/shared/domain'
import { Icon } from '@quarry/standard-ui/icons'
import { Select } from '@quarry/standard-ui/foundations/select'
import { useTask } from '@/hooks/useTask'
import { LibrarySDK } from '@/SDKs/LibrarySDK/sdk'
import { LineageExplorerSDK } from '../../sdk'

/** The branch the canvas's edges are read on: main, or any branch with lineage. Switching it is an edit, saved with the exploration. */
export function LineageBranchSelect() {
    const branch = LineageExplorerSDK.useDocument(d => d.branch)
    const [, [branchesRequest]] = LibrarySDK.useWith(
        () => null,
        query => [query.lineageBranches],
    )

    // The action reports its own failure; the task only drives the select's pending state.
    const [switchTask, withSwitchTask] = useTask()

    // Until the list arrives, the branch the canvas is on is the only choice.
    const branches = branchesRequest.data?.branches ?? [branch]

    const switchBranch = withSwitchTask((value: string) => LineageExplorerSDK.actions.graph.setBranch(value as Foundations.Branch))

    return (
        <Select.Root value={branch} onValueChange={switchBranch} disabled={switchTask.pending}>
            <Select.Trigger size='default' aria-label='Branch' className='max-w-56'>
                <Icon name='git-branch' />
                <Select.Value />
            </Select.Trigger>
            <Select.Content>
                {branches.map(name => (
                    <Select.Item key={name} value={name}>
                        {name}
                    </Select.Item>
                ))}
            </Select.Content>
        </Select.Root>
    )
}
