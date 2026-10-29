import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Card } from '@quarry/standard-ui/foundations/card'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { App } from '@/AppKit'
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

    const rids = history?.rids ?? []
    const runs = rids.map(checkRunRid => checkRuns[checkRunRid])

    return (
        <div className='mx-auto flex min-h-0 w-full max-w-[1200px] flex-1 flex-col gap-4 overflow-auto p-8'>
            <App.Content.Title>Checks</App.Content.Title>

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
                    <Card.Root className='shrink-0 py-0'>
                        <CheckRunTable checkRuns={runs} />
                    </Card.Root>

                    {history?.nextBefore && (
                        <Button
                            className='self-center'
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
