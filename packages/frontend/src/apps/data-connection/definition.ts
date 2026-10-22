import type { App } from '@/AppKit'

/** Sources and their syncs: a home listing sources, and one source's page. */
export const dataConnectionApp: App.Definition = {
    id:           'data-connection',
    label:        'Data Connection',
    icon:         'data-connection',
    to:           '/data-connection',
    inNavigation: false,
    opens: {
        source: rid => ({ to: '/data-connection/sources/$rid', params: { rid } }),
    },
}
