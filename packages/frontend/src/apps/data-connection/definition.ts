import type { App } from '@/AppKit'

/** Sources and their syncs: a home listing sources, and one source's page. */
export const dataConnectionApp: App.Definition = {
    id:           'data-connection',
    label:        'Data Connection',
    glyph: {
        icon:  'data-connection',
        tile:  'bg-amber-500/15',
        base:  'fill-amber-500',
        parts: {
            1: 'fill-orange-600',                            // the badge
            2: 'fill-amber-50',                              // its bolt
            4: 'fill-amber-300',                             // the database's top
        },
    },
    to:           '/data-connection',
    inNavigation: false,
    opens: {
        source: rid => ({ to: '/data-connection/sources/$rid', params: { rid } }),
    },
}
