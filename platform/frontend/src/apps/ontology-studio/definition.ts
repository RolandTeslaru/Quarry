import type { App } from '@/AppKit'

/** Ontology Studio: the ontology's object types and link types — what the data in datasets is about. */
export const ontologyStudioApp: App.Definition = {
    id:           'ontology-studio',
    label:        'Ontology Studio',
    description:  'Model what your datasets describe: object types backed by datasets, and the links between them.',
    glyph: {
        icon: 'cube',
        tile: 'bg-cyan-500/15',
        base: 'fill-cyan-600',
    },
    to:           '/ontology-studio',
    inNavigation: true,
    home: {
        tint: '--color-cyan-600',
        wave: { speed: 0.05, frequency: 1.5, amplitude: 0.24 },
    },
    opens: {},
}
