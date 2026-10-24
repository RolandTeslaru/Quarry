import { useState } from 'react'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Tabs } from '@quarry/standard-ui/foundations/tabs'
import type { CodeWorkspace } from '@quarry/shared/domain'
import { TableViewer } from '@/components/TableViewer'
import { number } from '@/utils/format'

/** A preview the page asked for: running while `result` is null. */
export interface PreviewRun {
    readonly transform: string
    readonly result:    CodeWorkspace.Preview.Result | null
}

interface Props {
    run:     PreviewRun
    onRerun: () => void
    onClose: () => void
}

/**
 * Under the editor: a preview's outputs in the same table viewer as datasets
 * (one tab per output), its logs, or — when the transform raised — its
 * error and traceback. Nothing here was written anywhere.
 */
export function PreviewPanel({ run, onRerun, onClose }: Props) {
    const name = run.transform.slice(run.transform.lastIndexOf('.') + 1)

    return (
        <section aria-label='Preview' className='flex h-2/5 min-h-48 shrink-0 flex-col border-t'>
            <div className='flex h-9 shrink-0 items-center gap-2 border-b px-3'>
                <span className='text-xs font-medium'>Preview</span>
                <span className='truncate font-mono text-xs text-muted-foreground' title={run.transform}>{name}</span>
                <span className='text-xs text-muted-foreground'>· on samples, nothing written</span>

                <div className='ml-auto flex items-center gap-1'>
                    <Button variant='minimal' size='sm' icon='play' loading={run.result === null} onClick={onRerun}>
                        Run again
                    </Button>
                    <Button variant='minimal' size='sm' icon='cross' aria-label='Close preview' onClick={onClose} />
                </div>
            </div>

            <div className='min-h-0 flex-1'>
                <PreviewBody result={run.result} />
            </div>
        </section>
    )
}

interface PreviewBodyProps {
    result: CodeWorkspace.Preview.Result | null
}

function PreviewBody({ result }: PreviewBodyProps) {
    if (!result) {
        return (
            <div className='flex h-full items-center justify-center gap-2 text-xs text-muted-foreground'>
                <Spinner className='size-4' role='status' aria-label='Running the preview' />
                Sampling the inputs and running the transform…
            </div>
        )
    }

    if ('error' in result)
        return <PreviewFailure failure={result} />

    return <PreviewOutputs outputs={result.outputs} logs={result.logs} />
}

interface PreviewFailureProps {
    failure: CodeWorkspace.Preview.Failure
}

/** The transform raised: its message, and the traceback to find where. */
function PreviewFailure({ failure }: PreviewFailureProps) {
    return (
        <div className='flex h-full flex-col gap-2 overflow-auto p-3'>
            <p className='text-xs font-medium text-destructive'>{failure.error.message}</p>
            <pre className='font-mono text-xs whitespace-pre-wrap text-muted-foreground'>{failure.error.traceback}</pre>
        </div>
    )
}

interface PreviewOutputsProps {
    outputs: Record<string, CodeWorkspace.Preview.Output>
    logs:    string[]
}

const LOGS_TAB = '__logs'

/** One tab per output, then the logs if there are any. */
function PreviewOutputs({ outputs, logs }: PreviewOutputsProps) {
    const names = Object.keys(outputs)
    const [tab, setTab] = useState(names[0] ?? LOGS_TAB)

    const output = outputs[tab]

    return (
        <Tabs.Root value={tab} onValueChange={setTab} className='flex h-full flex-col gap-0'>
            <div className='flex shrink-0 items-center gap-2 px-3 py-1.5'>
                <Tabs.List size='sm' aria-label='Preview outputs'>
                    {names.map(outputName => (
                        <Tabs.Trigger key={outputName} value={outputName}>{outputName}</Tabs.Trigger>
                    ))}
                    {logs.length > 0 && <Tabs.Trigger value={LOGS_TAB}>Logs ({logs.length})</Tabs.Trigger>}
                </Tabs.List>

                {output && (
                    <span className='ml-auto text-xs text-muted-foreground'>
                        {number(output.rowCount)} rows · {number(output.columns.length)} columns
                        {output.rowCount > output.rows.length && ` · showing ${number(output.rows.length)}`}
                    </span>
                )}
            </div>

            <div className='min-h-0 flex-1'>
                {output && <TableViewer columns={output.columns} rows={output.rows} />}

                {tab === LOGS_TAB && (
                    <pre className='h-full overflow-auto p-3 font-mono text-xs whitespace-pre-wrap'>{logs.join('\n')}</pre>
                )}
            </div>
        </Tabs.Root>
    )
}
