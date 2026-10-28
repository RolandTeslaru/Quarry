import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { CodeWorkspaceSDK } from '@/SDKs/CodeWorkspaceSDK/sdk'
import { Empty } from '@/components/Empty'
import { ErrorNotice } from '@/components/ErrorNotice'
import { useTask } from '@/hooks/useTask'
import { CheckRunTable } from '../../components/CheckRunTable'

export const Route = createFileRoute('/_workspace/code-workspaces/$rid/checks')({
    component: ChecksTab,
})

/**
 * The workspace's check runs — what each pushed commit went through — newest
 * first, a page at a time. Live: CodeWorkspaceSDK follows the open workspace's
 * runs, so new ones appear on top and running ones update in place.
 */
function ChecksTab() {
    const { rid } = Route.useParams()

    const [{ history, checkRuns }, [checkRunsRequest]] = CodeWorkspaceSDK.useWith(
        state => ({ history: state.checkRunHistory[rid], checkRuns: state.checkRuns }),
        query => [query.checkRuns(rid)],
    )

    const [older, withOlder] = useTask()

    const runs = history?.rids.map(checkRunRid => checkRuns[checkRunRid]).filter(run => run !== undefined) ?? []

    return (
        <div className='flex min-h-0 flex-1 flex-col overflow-auto p-6'>
            <div className='mb-4 flex items-center justify-between'>
                <div>
                    <h2 className='text-base font-semibold'>Checks</h2>
                    <p className='text-sm text-muted-foreground'>Every pushed commit runs quarry-ci.yml — live.</p>
                </div>
                <Button
                    variant='minimal'
                    icon='refresh'
                    aria-label='Refresh checks'
                    loading={checkRunsRequest.isFetching}
                    onClick={() => void checkRunsRequest.refetch()}
                />
            </div>

            <ErrorNotice error={checkRunsRequest.error ?? older.error} />

            {checkRunsRequest.isPending && <Spinner className='size-6' role='status' aria-label='Loading' />}

            {checkRunsRequest.isSuccess && runs.length === 0 && (
                <Empty
                    icon='tick-circle'
                    title='No checks yet'
                    description='Commit and push a change: its check runs quarry-ci.yml, and shows up here as it goes.'
                />
            )}

            {runs.length > 0 && (
                <>
                    <CheckRunTable checkRuns={runs} />

                    {history?.nextBefore && (
                        <Button
                            className='mt-4 self-center'
                            variant='outlined'
                            loading={older.pending}
                            onClick={withOlder(() => CodeWorkspaceSDK.actions.checkRun.loadOlder(rid))}
                        >
                            Load older
                        </Button>
                    )}
                </>
            )}
        </div>
    )
}
