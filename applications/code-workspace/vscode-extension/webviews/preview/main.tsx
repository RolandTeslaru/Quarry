import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Badge } from '@quarry/standard-ui/foundations/Badge'
import { Button } from '@quarry/standard-ui/foundations/button'
import { Callout } from '@quarry/standard-ui/foundations/callout'
import { NonIdealState } from '@quarry/standard-ui/foundations/nonIdealState'
import { Spinner } from '@quarry/standard-ui/foundations/spinner'
import { Tabs } from '@quarry/standard-ui/foundations/tabs'
import { Icon } from '@quarry/standard-ui/icons'
import { TableViewer } from '@quarry/standard-ui/components/TableViewer'
import { cn } from '@quarry/standard-ui/utils/cn'
import { CodeWorkspace, type CodeTransform } from '@quarry/shared/domain'
import { PreviewMessage } from '../../src/domain/PreviewMessage'
import { followVsCodeTheme } from '../theme'
import { vscode } from '../vscode'

/** Rows sampled from each input — pipeline.ts PREVIEW_ROWS. */
const SAMPLE_ROWS = 1000

const LOGS_TAB = '__logs'

const send = (message: PreviewMessage.ToExtension) => vscode.postMessage(message)

/**
 * The Preview panel, in two columns as in Foundry: the transform — its inputs
 * (sampled) and outputs — on the left; on the right, the chosen output's rows
 * in the shared table viewer, its logs, or where it raised. Nothing here was
 * written anywhere.
 */
function PreviewPanel() {
    const [state, setState] = useState<PreviewMessage.ToPage | null>(null)
    const [tab, setTab] = useState<string | null>(null)

    useEffect(() => {
        const receive = (event: MessageEvent<unknown>) => {
            if (PreviewMessage.isToPage(event.data))
                setState(event.data)
        }

        window.addEventListener('message', receive)
        send({ type: 'ready' })

        return () => window.removeEventListener('message', receive)
    }, [])

    if (!state) {
        return (
            <div className='flex h-full items-center justify-center'>
                <NonIdealState
                    icon='play'
                    title='Preview a transform'
                    description='▶ Preview in the editor’s title runs one on samples of its inputs. Nothing is written.'
                />
            </div>
        )
    }

    const outputs = Object.keys(state.transform.outputs)
    // The chosen output while the transform still has it; else its first.
    const selected = tab !== null && (tab === LOGS_TAB || outputs.includes(tab)) ? tab : outputs[0] ?? LOGS_TAB

    return (
        // One row, the panel's height: the page never scrolls — the left column and the table each do, on their own.
        <div className='grid h-full grid-cols-[18rem_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden'>
            <TransformColumn state={state} selected={selected} onSelect={setTab} />

            <div className='min-h-0 min-w-0 border-l'>
                <ResultColumn state={state} selected={selected} onSelect={setTab} />
            </div>
        </div>
    )
}

interface ColumnProps {
    state:    PreviewMessage.ToPage
    selected: string
    onSelect: (tab: string) => void
}

/** Left: the transform, what it reads (sampled), and what it writes — pick an output to see it. */
function TransformColumn({ state, selected, onSelect }: ColumnProps) {
    const { transform, labels } = state
    const result = state.type === 'result' && !('error' in state.result) ? state.result : null
    const running = state.type === 'running'

    const inputs = Object.entries(transform.inputs)
    const outputs = Object.entries(transform.outputs)

    return (
        <aside className='flex min-h-0 flex-col overflow-y-auto'>
            <header className='flex items-start gap-2 border-b px-3 py-2'>
                <div className='min-w-0 flex-1'>
                    <div className='truncate text-sm font-medium'>{CodeWorkspace.ModuleFunctionPath.getFunctionName(transform.name)}</div>
                    <div className='truncate text-xs text-muted-foreground' title={transform.name}>{CodeWorkspace.ModuleFunctionPath.getModuleName(transform.name)}</div>
                </div>

                {running
                    ? <Button size='sm' icon='stop' onClick={() => send({ type: 'stop' })}>Stop</Button>
                    : <Button size='sm' icon='play' onClick={() => send({ type: 'rerun' })}>Preview</Button>}
            </header>

            <Section title='Inputs' count={inputs.length}>
                {inputs.map(([name, reference]) => (
                    <Card key={name} icon='th' label={labels[reference]} reference={reference} parameter={name}>
                        <Badge variant='outline'>Sample · {formatNumber(SAMPLE_ROWS)} rows</Badge>
                        {result?.inputs[name] && <Badge variant='outline'>v{result.inputs[name].sequence}</Badge>}
                    </Card>
                ))}
            </Section>

            <Icon name='arrow-down' className='mx-auto my-1 shrink-0 fill-muted-foreground' />

            <Section title='Outputs' count={outputs.length}>
                {outputs.map(([name, reference]) => {
                    const output = result?.outputs[name]

                    return (
                        <Card
                            key={name}
                            icon='th-derived'
                            label={labels[reference]}
                            reference={reference}
                            parameter={name}
                            active={selected === name}
                            onClick={() => onSelect(name)}
                        >
                            <span className='text-xs text-muted-foreground'>
                                {output
                                    ? `${formatNumber(output.rowCount)} rows · ${formatNumber(output.columns.length)} columns`
                                    : 'Calculated from sample inputs'}
                            </span>
                        </Card>
                    )
                })}
            </Section>
        </aside>
    )
}

/** Right: the chosen output's rows (a tab each, then the logs), the run's progress, or why it failed. */
function ResultColumn({ state, selected, onSelect }: ColumnProps) {
    switch (state.type) {
        case 'running':
            return (
                <div className='flex h-full items-center justify-center gap-2 text-xs text-muted-foreground'>
                    <Spinner className='size-4' role='status' aria-label='Running the preview' />
                    Sampling the inputs and running the transform…
                </div>
            )

        case 'stopped':
            return <p className='p-3 text-xs text-muted-foreground'>Stopped.</p>

        case 'failed':
            return (
                <div className='p-3'>
                    <Callout intent='danger' title='The preview didn’t run'>{state.message}</Callout>
                </div>
            )

        case 'result':
            if ('error' in state.result)
                return <PreviewFailure failure={state.result} />

            return <PreviewOutputs result={state.result} selected={selected} onSelect={onSelect} />
    }
}

interface PreviewOutputsProps {
    result:   Exclude<CodeWorkspace.Preview.Result, CodeTransform.Failure>
    selected: string
    onSelect: (tab: string) => void
}

function PreviewOutputs({ result, selected, onSelect }: PreviewOutputsProps) {
    const output = result.outputs[selected]

    return (
        <Tabs.Root value={selected} onValueChange={onSelect} className='flex h-full flex-col gap-0'>
            <div className='flex h-9 shrink-0 items-center gap-2 border-b px-2'>
                <Tabs.List size='sm' aria-label='Preview outputs'>
                    {Object.keys(result.outputs).map(name => <Tabs.Trigger key={name} value={name}>{name}</Tabs.Trigger>)}
                    {result.logs.length > 0 && <Tabs.Trigger value={LOGS_TAB}>Logs ({result.logs.length})</Tabs.Trigger>}
                </Tabs.List>

                {output && (
                    <span className='ml-auto text-xs text-muted-foreground'>
                        {output.rowCount > output.rows.length
                            ? `Showing ${formatNumber(output.rows.length)} of ${formatNumber(output.rowCount)} rows`
                            : `${formatNumber(output.rowCount)} rows`}
                        {` · ${formatNumber(output.columns.length)} columns`}
                    </span>
                )}
            </div>

            <div className='min-h-0 flex-1'>
                {output && <TableViewer columns={output.columns} rows={output.rows} />}

                {selected === LOGS_TAB && (
                    <pre className='h-full overflow-auto p-3 font-mono text-xs whitespace-pre-wrap'>{result.logs.join('\n')}</pre>
                )}
            </div>
        </Tabs.Root>
    )
}

/** The transform raised: its message, and the traceback to find where. */
function PreviewFailure({ failure }: { failure: CodeTransform.Failure }) {
    return (
        <div className='flex h-full flex-col gap-2 overflow-auto p-3'>
            <p className='text-xs font-medium text-destructive'>{failure.error.message}</p>
            <pre className='font-mono text-xs whitespace-pre-wrap text-muted-foreground'>{failure.error.traceback}</pre>
        </div>
    )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
    return (
        <section className='flex flex-col gap-1.5 px-3 py-2'>
            <h3 className='flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                {title}
                <Badge variant='secondary'>{count}</Badge>
            </h3>
            {children}
        </section>
    )
}

interface CardProps {
    icon:      'th' | 'th-derived'
    /** The dataset's name, if known. */
    label:     PreviewMessage.Label | undefined
    reference: string
    /** The transform's parameter it's bound to. */
    parameter: string
    active?:   boolean
    onClick?:  () => void
    children:  React.ReactNode
}

/** One input or output: its dataset, the parameter it's bound to, and what's known of it. */
function Card({ icon, label, reference, parameter, active = false, onClick, children }: CardProps) {
    const Element = onClick ? 'button' : 'div'

    return (
        <Element
            type={onClick ? 'button' : undefined}
            onClick={onClick}
            title={label?.location ? `${label.location}/${label.name}` : reference}
            className={cn(
                'flex w-full flex-col gap-1 rounded-md border px-2.5 py-2 text-left',
                onClick && 'cursor-pointer hover:bg-muted',
                active && 'border-primary bg-muted',
            )}
        >
            <span className='flex min-w-0 items-center gap-1.5'>
                <Icon name={icon} className='shrink-0 fill-muted-foreground' />
                <span className='truncate text-sm'>{label?.name ?? reference}</span>
                <span className='ml-auto shrink-0 font-mono text-xs text-muted-foreground'>{parameter}</span>
            </span>
            <span className='flex flex-wrap items-center gap-1'>{children}</span>
        </Element>
    )
}

const formatNumber = (value: number): string => new Intl.NumberFormat().format(value)

followVsCodeTheme()
createRoot(document.getElementById('root')!).render(<PreviewPanel />)
