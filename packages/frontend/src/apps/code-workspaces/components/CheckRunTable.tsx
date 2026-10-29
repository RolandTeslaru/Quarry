import { Fragment, useState } from 'react'
import { Badge } from '@quarry/standard-ui/foundations/Badge'
import { Table } from '@quarry/standard-ui/foundations/table'
import { Icon } from '@quarry/standard-ui/icons'
import { cn } from '@quarry/standard-ui/utils/cn'
import { CodeWorkspace } from '@quarry/shared/domain'
import { ago, dateTime } from '@/utils/format'
import { CHECK_RUN_STATUSES, CHECK_STEP_STATUSES } from '../constants'

import CI = CodeWorkspace.CI

interface CheckRunTableProps {
    checkRuns: CI.CheckRun.Schema[]
}

/** A workspace's check runs, newest first; a row opens to its steps and their logs. */
export function CheckRunTable({ checkRuns }: CheckRunTableProps) {
    const [openRid, setOpenRid] = useState<CI.CheckRun.Rid | null>(null)

    return (
        <Table.Root>
            <Table.Header>
                <Table.Row>
                    <Table.Head className='w-8' />
                    <Table.Head>Status</Table.Head>
                    <Table.Head>Branch</Table.Head>
                    <Table.Head>Commit</Table.Head>
                    <Table.Head>Pushed</Table.Head>
                    <Table.Head>Took</Table.Head>
                </Table.Row>
            </Table.Header>
            <Table.Body>
                {checkRuns.map(run => {
                    const open = openRid === run.rid

                    return (
                        <Fragment key={run.rid}>
                            <Table.Row
                                className='cursor-pointer'
                                aria-expanded={open}
                                onClick={() => setOpenRid(open ? null : run.rid)}
                            >
                                <Table.Cell>
                                    <Icon name={open ? 'chevron-down' : 'chevron-right'} className='text-muted-foreground' />
                                </Table.Cell>
                                <Table.Cell>
                                    <CheckRunStatus status={run.status} />
                                </Table.Cell>
                                <Table.Cell className='font-medium'>{run.branch}</Table.Cell>
                                <Table.Cell className='font-mono text-xs'>{run.commit.slice(0, 7)}</Table.Cell>
                                <Table.Cell title={dateTime(run.createdAt)}>{ago(run.createdAt)}</Table.Cell>
                                <Table.Cell className='text-muted-foreground'>{getRunDuration(run)}</Table.Cell>
                            </Table.Row>

                            {open && (
                                <Table.Row className='hover:bg-transparent'>
                                    <Table.Cell colSpan={6} className='p-0'>
                                        <CheckRunSteps run={run} />
                                    </Table.Cell>
                                </Table.Row>
                            )}
                        </Fragment>
                    )
                })}
            </Table.Body>
        </Table.Root>
    )
}

interface CheckRunStatusProps {
    status: CI.CheckRun.Status
}

function CheckRunStatus({ status }: CheckRunStatusProps) {
    const look = CHECK_RUN_STATUSES[status]

    return (
        <Badge variant={look.variant}>
            <Icon name={look.icon} />
            {look.label}
        </Badge>
    )
}

interface CheckRunStepsProps {
    run: CI.CheckRun.Schema
}

/** Each step: its status, how long it took, its exit code — and its output, opened on demand. */
function CheckRunSteps({ run }: CheckRunStepsProps) {
    return (
        <div className='flex flex-col gap-1 bg-muted/40 px-10 py-3'>
            {run.failure && (
                <p className='mb-2 text-sm text-destructive'>
                    <span className='font-medium'>{run.failure.step}:</span> {run.failure.message}
                </p>
            )}

            {run.steps.map((step, index) => {
                const look = CHECK_STEP_STATUSES[step.status]

                return (
                    <details key={index} className='group text-sm'>
                        <summary className={cn('flex cursor-pointer list-none items-center gap-2 py-1', !step.log && 'cursor-default')}>
                            <Icon name={look.icon} className={look.className} title={look.label} />
                            <span className='font-medium'>{step.name}</span>
                            {step.exitCode !== null && step.exitCode !== 0 && (
                                <span className='text-xs text-destructive'>exit {step.exitCode}</span>
                            )}
                            <span className='ml-auto text-xs text-muted-foreground'>{getStepDuration(step)}</span>
                        </summary>

                        {step.log && (
                            <pre className='mt-1 mb-2 max-h-80 overflow-auto rounded-md bg-background p-3 font-mono text-xs whitespace-pre-wrap'>
                                {step.log}
                            </pre>
                        )}
                    </details>
                )
            })}
        </div>
    )
}

function getRunDuration(run: CI.CheckRun.Schema): string {
    if (!run.startedAt)
        return '—'

    if (!run.finishedAt)
        return 'running…'

    return formatDuration(run.finishedAt.getTime() - run.startedAt.getTime())
}

function getStepDuration(step: CI.CheckRun.Step.Schema): string {
    if (!step.startedAt || !step.finishedAt)
        return step.status === 'running' ? 'running…' : ''

    return formatDuration(step.finishedAt.getTime() - step.startedAt.getTime())
}

/** `850 ms`, `12 s`, `3 min 4 s`. */
function formatDuration(ms: number): string {
    if (ms < 1_000)
        return `${Math.max(0, Math.round(ms))} ms`

    const seconds = Math.round(ms / 1_000)

    if (seconds < 60)
        return `${seconds} s`

    return `${Math.floor(seconds / 60)} min ${seconds % 60} s`
}
