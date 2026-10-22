import type { App } from '@/AppKit'

/** Test app: every AppKit part, no backend. */
export const layoutDemoApp: App.Definition = {
    id:           'layout-demo',
    label:        'Layout demo',
    icon:         'page-layout',
    to:           '/layout-demo',
    inNavigation: true,
    opens:        {},
}
