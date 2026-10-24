import type { ToOptions } from '@tanstack/react-router'
import type { Library } from '@quarry/shared/domain'
import type { App } from '@/AppKit'
import { codeWorkspacesApp } from '@/apps/code-workspaces/definition'
import { dataConnectionApp } from '@/apps/data-connection/definition'
import { datasetsApp } from '@/apps/datasets/definition'
import { keychainApp } from '@/apps/keychain/definition'
import { layoutDemoApp } from '@/apps/layout-demo/definition'
import { libraryApp } from '@/apps/library/definition'
import { minimalDemoApp } from '@/apps/minimal-demo/definition'
import { pipelineBuilderApp } from '@/apps/pipeline-builder/definition'

/**
 * Every app in the workspace, from each app's own definition. The router mounts
 * apps by URL; this list tells the shell they exist. Definitions import no app
 * code, so the registry stays in the main bundle without pulling apps in.
 */
export const APPS: App.Definition[] = [
    libraryApp,
    dataConnectionApp,
    datasetsApp,
    pipelineBuilderApp,
    codeWorkspacesApp,
    keychainApp,
    // Test apps for the shell and AppKit; no backend.
    layoutDemoApp,
    minimalDemoApp,
]

/** The app each resource type opens in — the first that declares it in `opens`. */
export const APP_FOR_TYPE: Partial<Record<Library.Resource.Type, App.Definition>> = Object.fromEntries(
    [...APPS].reverse().flatMap(app => Object.keys(app.opens).map(type => [type, app])),
)

/** The glyph of the app that opens a resource type, if one does. */
export function resourceGlyph(type: Library.Resource.Type): App.Glyph | undefined {
    return APP_FOR_TYPE[type]?.glyph
}

/** Where a resource opens: its owning app's route, else the Library Explorer's (which redirects to the owner). */
export function resourceRoute(type: Library.Resource.Type, rid: Library.Resource.Rid): ToOptions {
    return APP_FOR_TYPE[type]?.opens[type]?.(rid) ?? { to: '/library/$rid', params: { rid } }
}
