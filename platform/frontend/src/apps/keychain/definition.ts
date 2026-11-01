import type { App } from '@/AppKit'

/** Credentials for sources. */
export const keychainApp: App.Definition = {
    id:           'keychain',
    label:        'Keychain',
    description:  'Logins to external systems, encrypted at rest. Sources use them; only editors can see their values.',
    glyph: {
        icon:  'key',
        tile:  'bg-emerald-500/15',
        base:  'fill-emerald-600',
        parts: { 1: 'fill-emerald-200' },                    // the bow's hole
    },
    to:           '/keychain',
    inNavigation: true,
    home: {
        tint: '--color-emerald-600',
        wave: { speed: 0.02, frequency: 1.1, amplitude: 0.18 },
    },
    opens: {
        credential: () => ({ to: '/keychain' }),
    },
}
