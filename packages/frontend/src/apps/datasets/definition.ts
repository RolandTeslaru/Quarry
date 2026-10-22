import type { App } from '@/AppKit'

/** Datasets: a home listing them, and one dataset's rows, schema and files. */
export const datasetsApp: App.Definition = {
    id:           'datasets',
    label:        'Datasets',
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
    opens: {
        dataset: rid => ({ to: '/datasets/$rid', params: { rid } }),
    },
}
