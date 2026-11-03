import { createFileRoute } from '@tanstack/react-router'
import { App } from '@/AppKit'
import { minimalDemoApp } from '../definition'

export const Route = createFileRoute('/_shell/minimal-demo/')({
    component: MinimalDemoApp,
})

/** Test app: navbar and content only — the left nav and sidebars are left out, so their columns collapse. */
function MinimalDemoApp() {
    return (
        <App.Overlay>
            <App.Nav>
                <App.Nav.Start>
                    <App.Nav.Icon glyph={minimalDemoApp.glyph} />
                    <App.Nav.Rows>
                        <App.Nav.Title>Minimal demo</App.Nav.Title>
                    </App.Nav.Rows>
                </App.Nav.Start>
            </App.Nav>

            <App.Content>
                <div className='p-6 text-sm text-muted-foreground'>
                    Only `App.Nav` and `App.Content` — the content should span the full width.
                </div>
            </App.Content>
        </App.Overlay>
    )
}
