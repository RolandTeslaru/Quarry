import type { ComponentProps } from 'react'
import type { IconName } from '@blueprintjs/icons'

export type { IconName } from '@blueprintjs/icons'

export type IconGrid = 16 | 20

export type IconPathsLoader = () => Promise<{ default: readonly string[] }>

export interface IconProps extends Omit<ComponentProps<'svg'>, 'name' | 'children' | 'viewBox'> {
    name: IconName
    size?: number
    title?: string
}
