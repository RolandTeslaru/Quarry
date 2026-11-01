import { Button } from '@quarry/standard-ui/foundations/button'
import { ColorSheet, type ColorGroup, type ColorSwatch } from './ColorSheet'
import type { PreviewExampleProps } from './Preview'

function token(label: string, name: string): ColorSwatch {
    return {
        id: name,
        label,
        token: `--${name}`,
        color: `var(--${name})`,
    }
}

const solidIntents = ['none', 'primary', 'success', 'warning', 'danger'] as const
const extendedIntents = ['ai', 'message'] as const

const groups: ColorGroup[] = [
    {
        title: 'Surfaces',
        colors: [
            token('Page', 'background'),
            token('Panel', 'surface'),
            token('Elevated content', 'surface-elevated'),
            token('Elevated sidebar', 'surface-elevated-sidebar'),
            token('Card', 'card'),
            token('Popover', 'popover'),
            token('Input', 'input'),
            token('Muted', 'muted'),
        ],
    },
    {
        title: 'Text',
        colors: [
            token('Main text', 'foreground'),
            token('Muted text', 'muted-foreground'),
            token('Card text', 'card-foreground'),
            token('Popover text', 'popover-foreground'),
        ],
    },
    {
        title: 'Borders',
        colors: [
            token('Default border', 'border'),
            token('Input border', 'input-border'),
            token('Popover border', 'popover-border'),
            token('Separator', 'separator'),
        ],
    },
    {
        title: 'Interaction colors',
        colors: [
            token('Primary', 'primary'),
            token('Primary hover', 'primary-hover'),
            token('Primary edge', 'primary-accent'),
            token('Secondary / item hover', 'secondary'),
            token('Accent', 'accent'),
            token('Focus ring', 'ring'),
            {
                id: 'selected-item',
                label: 'Selected item',
                token: 'primary / 15%',
                color: 'color-mix(in oklch, var(--primary) 15%, transparent)',
            },
            token('Destructive', 'destructive'),
        ],
    },
    {
        title: 'Solid button intents',
        colors: solidIntents.map(intent => ({
            id: `solid-${intent}`,
            label: intent,
            token: `Button · solid · ${intent}`,
            sample: <Button intent={intent} tabIndex={-1}>Aa</Button>,
        })),
    },
    {
        title: 'Extended accents',
        colors: extendedIntents.map(intent => ({
            id: `extended-${intent}`,
            label: intent,
            token: `Button · ${intent}`,
            sample: <Button intent={intent} tabIndex={-1}>Aa</Button>,
        })),
    },
]

export function StandardColorSheet({ theme }: PreviewExampleProps) {
    return (
        <ColorSheet
            theme={theme}
            groups={groups}
            description='Live standard-ui theme colors. Values follow the appearance setting; checkerboards show transparency.'
        />
    )
}
