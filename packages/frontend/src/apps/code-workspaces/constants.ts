import type { BadgeProps } from '@quarry/standard-ui/foundations/Badge'
import type { IconName } from '@quarry/standard-ui/icons'
import { CodeWorkspace } from '@quarry/shared/domain'

import CI = CodeWorkspace.CI

/** A workspace's tabs — each a route under routes/$rid/. */
export type WorkspaceTab = 'code' | 'branches' | 'checks' | 'pull-requests' | 'settings'

/** Every tab, by id, in the order the header shows them. */
export const WORKSPACE_TABS = {
    'code':          { label: 'Code',          to: '/code-workspaces/$rid' },
    'branches':      { label: 'Branches',      to: '/code-workspaces/$rid/branches' },
    'checks':        { label: 'Checks',        to: '/code-workspaces/$rid/checks' },
    'pull-requests': { label: 'Pull Requests', to: '/code-workspaces/$rid/pull-requests' },
    'settings':      { label: 'Settings',      to: '/code-workspaces/$rid/settings' },
} as const satisfies Record<WorkspaceTab, { label: string; to: string }>

/** How each check run status shows: its badge. */
export const CHECK_RUN_STATUSES: Record<CI.CheckRun.Status, CheckRunStatusLook> = {
    waiting:   { label: 'Waiting',   icon: 'time',    variant: 'secondary' },
    scheduled: { label: 'Scheduled', icon: 'time',    variant: 'secondary' },
    running:   { label: 'Running',   icon: 'spinner', variant: 'active' },
    succeeded: { label: 'Passed',    icon: 'tick',    variant: 'success' },
    failed:    { label: 'Failed',    icon: 'error',   variant: 'destructive' },
    canceled:  { label: 'Canceled',  icon: 'disable', variant: 'secondary' },
}

/** How each step status shows: its icon, in its colour. */
export const CHECK_STEP_STATUSES: Record<CI.CheckRun.Step.Status, { label: string; icon: IconName; className: string }> = {
    waiting:   { label: 'Waiting',   icon: 'circle',  className: 'text-muted-foreground' },
    running:   { label: 'Running',   icon: 'spinner', className: 'text-sky-600' },
    succeeded: { label: 'Passed',    icon: 'tick',    className: 'text-emerald-600' },
    failed:    { label: 'Failed',    icon: 'error',   className: 'text-destructive' },
    skipped:   { label: 'Skipped',   icon: 'disable', className: 'text-muted-foreground' },
}

export interface CheckRunStatusLook {
    label:   string
    icon:    IconName
    variant: NonNullable<BadgeProps['variant']>
}
