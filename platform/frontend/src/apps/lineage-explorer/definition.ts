import type { App } from '@/AppKit'

/** Lineage Explorer: saved explorations of how resources feed each other. */
export const lineageExplorerApp: App.Definition = {
    id:           'lineage-explorer',
    label:        'Lineage Explorer',
    description:  'See how your resources feed each other, upstream and downstream, and save the graphs you build.',
    glyph: {
        icon: 'data-lineage',
        tile: 'bg-blue-500/15',
        base: 'fill-blue-600',
    },
    to:           '/lineage-explorer',
    inNavigation: true,
    home: {
        tint: '--color-blue-600',
        wave: { speed: 0.05, frequency: 1.5, amplitude: 0.24 },
    },
    opens: {
        'lineage-exploration': rid => ({ to: '/lineage-explorer/$rid', params: { rid } }),
    },
}
