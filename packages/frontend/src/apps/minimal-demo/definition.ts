import type { App } from '@/AppKit'

/** Test app: only a header and content — the unused columns collapse. Launcher only. */
export const minimalDemoApp: App.Definition = {
    id:           'minimal-demo',
    label:        'Minimal demo',
    icon:         'square',
    to:           '/minimal-demo',
    inNavigation: false,
    opens:        {},
}
