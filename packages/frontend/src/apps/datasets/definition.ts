import type { App } from '@/AppKit'

/** Datasets: a home listing them, and one dataset's rows, schema and files. */
export const datasetsApp: App.Definition = {
    id:           'datasets',
    label:        'Datasets',
    icon:         'th',
    to:           '/datasets',
    inNavigation: false,
    opens: {
        dataset: rid => ({ to: '/datasets/$rid', params: { rid } }),
    },
}
