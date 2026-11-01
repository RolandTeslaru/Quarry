import type { ComponentProps } from 'react'
import type { IconName as BlueprintIconName } from '@blueprintjs/icons'

/** An icon drawn from Blueprint's paths. */
export type PathIconName = BlueprintIconName

/** Every icon `Icon` draws: Blueprint's, and `spinner` (the Spinner component). */
export type IconName = PathIconName | 'spinner'

export type IconGrid = 16 | 20

export type IconPathsLoader = () => Promise<{ default: readonly string[] }>

export interface IconProps extends Omit<ComponentProps<'svg'>, 'name' | 'children' | 'viewBox'> {
    name: IconName
    size?: number
    title?: string
}
