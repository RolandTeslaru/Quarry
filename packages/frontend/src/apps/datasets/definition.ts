import type { App } from '@/AppKit'

/** Datasets: a home listing them, and one dataset's rows, schema and files. */
export const datasetsApp: App.Definition = {
    id:           'datasets',
    label:        'Datasets',
    description:  "Versioned tables: upload files or sync them from sources, then browse every version's rows, schema and files.",
    glyph: {
        icon:  'th',
        tile:  'bg-sky-500/15',
        base:  'fill-sky-600',
        parts: {                                             // the cells: first column darker
            1: 'fill-sky-300',
            2: 'fill-sky-300',
            3: 'fill-sky-300',
            4: 'fill-sky-100',
            5: 'fill-sky-100',
            6: 'fill-sky-100',
        },
    },
    to:           '/datasets',
    inNavigation: false,
    home: {
        tint: '--color-sky-600',
        wave: { speed: 0.04, frequency: 1.4, amplitude: 0.22 },
    },
    opens: {
        dataset: rid => ({ to: '/datasets/$rid', params: { rid } }),
    },
}
