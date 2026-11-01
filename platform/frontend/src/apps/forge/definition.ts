import type { App } from '@/AppKit'

/** Forge: the builds of datasets — who started them, what they build, how they went. */
export const forgeApp: App.Definition = {
    id:           'forge',
    label:        'Forge',
    description:  'Builds of your datasets: each one runs the transforms that produce them, in dependency order.',
    glyph: {
        illustration: 'anvil',
        tile:         'bg-red-500/15',
        base:         'fill-red-600',
    },
    to:           '/forge',
    inNavigation: true,
    home: {
        tint: '--color-red-600',
        wave: { speed: 0.05, frequency: 1.6, amplitude: 0.24 },
    },
    opens: {},
}
