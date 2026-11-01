import type { BadgeProps } from '@quarry/standard-ui/foundations/Badge'
import type { IconName } from '@quarry/standard-ui/icons'
import type { Forge } from '@quarry/shared/domain'

export interface BuildStatusLook {
    label:   string
    icon:    IconName
    variant: NonNullable<BadgeProps['variant']>
}

/** How each build status shows: its badge. */
export const BUILD_STATUSES: Record<Forge.Build.Status, BuildStatusLook> = {
    running:   { label: 'Running',   icon: 'time',    variant: 'active' },
    succeeded: { label: 'Succeeded', icon: 'tick',    variant: 'success' },
    failed:    { label: 'Failed',    icon: 'error',   variant: 'destructive' },
    canceled:  { label: 'Canceled',  icon: 'disable', variant: 'secondary' },
}
