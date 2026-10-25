import { Button } from '@quarry/standard-ui/foundations/button'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import type { CodeWorkspace } from '@quarry/shared/domain'
import { CodeWorkspaceSDK } from '../sdk'
import { ErrorNotice } from '@/components/ErrorNotice'

interface Props {
    rid: CodeWorkspace.Rid
}

/**
 * The user's IDE on the workspace — VS Code in the browser — once their
 * session is up. Starting one clones and installs the environment: a minute,
 * the first time. Shares the session query with whoever else reads it (the
 * page's Reconnect refetches it, and the editor reloads).
 */
export function IDESessionFrame({ rid }: Props) {
    const [, [sessionRequest]] = CodeWorkspaceSDK.useWith(
        () => null,
        query => [query.session(rid)],
    )

    if (sessionRequest.isPending) {
        return (
            <div className='flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground'>
                <Spinner className='size-6' role='status' aria-label='Starting the session' />
                Starting your session — the first time takes a minute.
            </div>
        )
    }

    if (sessionRequest.error || !sessionRequest.data) {
        return (
            <div className='p-6'>
                <ErrorNotice error={sessionRequest.error ?? 'The session didn’t start.'} />
                <Button onClick={() => void sessionRequest.refetch()}>Try again</Button>
            </div>
        )
    }

    return (
        <iframe
            // A reconnect may have restarted the session: reload the editor with it.
            key={sessionRequest.dataUpdatedAt}
            src={sessionRequest.data.url}
            title='Code editor'
            className='size-full border-0'
            allow='clipboard-read; clipboard-write'
        />
    )
}
