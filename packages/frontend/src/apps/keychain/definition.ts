import type { App } from '@/AppKit'

/** Credentials for sources. */
export const keychainApp: App.Definition = {
    id:           'keychain',
    label:        'Keychain',
    glyph: {
        icon:  'key',
        tile:  'bg-emerald-500/15',
        base:  'fill-emerald-600',
        parts: { 1: 'fill-emerald-200' },                    // the bow's hole
    },
    to:           '/keychain',
    inNavigation: true,
    opens: {
        credential: () => ({ to: '/keychain' }),
    },
}
