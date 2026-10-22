import type { App } from '@/AppKit'

/** Credentials for sources. */
export const keychainApp: App.Definition = {
    id:           'keychain',
    label:        'Keychain',
    icon:         'key',
    to:           '/keychain',
    inNavigation: true,
    opens:        {},
}
