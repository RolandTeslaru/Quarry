import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { index, layout, physical, rootRoute, route } from '@tanstack/virtual-file-routes'

// The route tree (TanStack virtual file routes): the shell's own routes, here in
// src/routes, and every app's routes from its own folder. Paths are relative to
// src/routes. Read by the router plugin (vite.config.ts) when it generates
// routeTree.gen.ts — a new app is picked up on the next generate (restart dev).

const APPS_DIRECTORY = fileURLToPath(new URL('./apps/', import.meta.url))

/** Every app folder with a routes/ directory, mounted at /<folder name>. */
const apps = readdirSync(APPS_DIRECTORY, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(`${APPS_DIRECTORY}${entry.name}/routes`))
    .map(entry => entry.name)
    .sort()

export const routes = rootRoute('root.tsx', [
    index('index.tsx'),
    route('/auth', 'auth/index.tsx'),
    route('/playground', 'playground/index.tsx'),
    route('/playground/blueprint', 'playground/blueprint/index.tsx'),
    route('/playground/standard', 'playground/standard/index.tsx'),

    // The shell (sidebar) around every app.
    layout('shell', 'shell.layout/index.tsx', apps.map(app => physical(`/${app}`, `../apps/${app}/routes`))),
])
