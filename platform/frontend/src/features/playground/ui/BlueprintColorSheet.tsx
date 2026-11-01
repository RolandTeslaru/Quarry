import { Button, Card, InputGroup } from '@blueprintjs/core'
import { ColorSheet, type ColorGroup, type ColorSwatch } from './ColorSheet'
import type { PreviewExampleProps } from './Preview'

function token(label: string, name: string): ColorSwatch {
    return {
        id: name,
        label,
        token: `--bp-${name}`,
        color: `var(--bp-${name})`,
    }
}

const solidIntents = ['none', 'primary', 'success', 'warning', 'danger'] as const

export function BlueprintColorSheet({ theme }: PreviewExampleProps) {
    const dark = theme === 'dark'

    const groups: ColorGroup[] = [
        {
            title: 'Surfaces',
            colors: [
                token('Playground page', dark ? 'palette-dark-gray-2' : 'palette-light-gray-5'),
                {
                    id: 'panel',
                    label: 'Panel / card',
                    token: 'Card · elevation 0',
                    sample: <Card elevation={0} />,
                },
                {
                    id: 'elevated',
                    label: 'Elevated card',
                    token: 'Card · elevation 2',
                    sample: <Card elevation={2} />,
                },
                token('Base surface', 'surface-background-color-default-rest'),
                token('Popover / menu', dark ? 'palette-dark-gray-3' : 'palette-white'),
                {
                    id: 'input',
                    label: 'Input',
                    token: 'InputGroup background',
                    sample: <InputGroup tabIndex={-1} readOnly />,
                },
                token('Muted layer', 'surface-layer-color-default'),
                token('Surface hover', 'surface-background-color-default-hover'),
            ],
        },
        {
            title: 'Text',
            colors: [
                token('Main text', dark ? 'palette-light-gray-5' : 'palette-dark-gray-1'),
                token('Muted text', dark ? 'palette-gray-4' : 'palette-gray-1'),
                token('Link', dark ? 'palette-blue-5' : 'palette-blue-2'),
                token('Primary text', 'typography-color-primary-rest'),
            ],
        },
        {
            title: 'Borders',
            colors: [
                token('Default border', 'surface-border-color-default'),
                token('Strong border', 'surface-border-color-strong'),
                {
                    id: 'divider',
                    label: 'Divider',
                    token: dark ? 'white / 20%' : 'black / 15%',
                    color: dark
                        ? 'color-mix(in srgb, var(--bp-palette-white) 20%, transparent)'
                        : 'color-mix(in srgb, var(--bp-palette-black) 15%, transparent)',
                },
                token('Focus outline', 'emphasis-focus-color'),
            ],
        },
        {
            title: 'Interaction colors',
            colors: [
                token('Primary', 'intent-primary-rest'),
                token('Primary hover', 'intent-primary-hover'),
                token('Primary active', 'intent-primary-active'),
                {
                    id: 'menu-hover',
                    label: 'Item hover',
                    token: 'gray 3 / 15%',
                    color: 'color-mix(in srgb, var(--bp-palette-gray-3) 15%, transparent)',
                },
                {
                    id: 'menu-active',
                    label: 'Item active',
                    token: 'gray 3 / 30%',
                    color: 'color-mix(in srgb, var(--bp-palette-gray-3) 30%, transparent)',
                },
                token('Primary layer', 'surface-layer-color-primary'),
                token('Neutral intent', 'intent-default-rest'),
                token('Primary foreground', 'intent-primary-foreground'),
            ],
        },
        {
            title: 'Solid button intents',
            colors: solidIntents.map(intent => ({
                id: `solid-${intent}`,
                label: intent,
                token: `Button · solid · ${intent}`,
                sample: <Button intent={intent} variant='solid' tabIndex={-1}>Aa</Button>,
            })),
        },
        {
            title: 'Extended accents',
            colors: [
                token('Violet', 'palette-violet-3'),
                token('Indigo', 'palette-indigo-3'),
            ],
        },
    ]

    return (
        <ColorSheet
            theme={theme}
            groups={groups}
            description='Blueprint surface, palette, and intent colors. Cards and inputs sample the actual controls; elevation uses shadow.'
        />
    )
}
