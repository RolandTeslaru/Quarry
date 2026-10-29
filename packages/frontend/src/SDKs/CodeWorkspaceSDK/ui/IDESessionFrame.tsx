import { Button } from '@quarry/standard-ui/foundations/button'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import type { CodeWorkspace } from '@quarry/shared/domain'
import { CodeWorkspaceSDK } from '../sdk'
import { ErrorNotice } from '@/components/ErrorNotice'

interface Props {
    rid:         CodeWorkspace.Rid
    /** The session is being replaced: the editor in it is about to go. */
    restarting?: boolean
}

/**
 * The user's IDE on the workspace — VS Code in the browser — once their
 * session is up. Starting one clones and installs the environment: a minute,
 * the first time. Shares the session query with whoever else reads it (the
 * page's Reconnect refetches it, and the editor reloads; its Restart replaces it).
 */
export function IDESessionFrame({ rid, restarting = false }: Props) {
    const [, [sessionRequest]] = CodeWorkspaceSDK.useWith(
        () => null,
        query => [query.session(rid)],
    )

    if (sessionRequest.isPending)
        return <SessionStarting label='Starting your session — the first time takes a minute.' />

    if (restarting)
        return <SessionStarting label='Restarting your session on a fresh container — your files stay.' />

    if (sessionRequest.isError) {
        return (
            <div className='p-6'>
                <ErrorNotice error={sessionRequest.error} />
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

interface SessionStartingProps {
    label: string
}

function SessionStarting({ label }: SessionStartingProps) {
    return (
        <div className='flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground'>
            <Spinner className='size-6' role='status' aria-label={label} />
            {label}
        </div>
    )
}
