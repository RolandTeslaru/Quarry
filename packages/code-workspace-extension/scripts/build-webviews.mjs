// The webviews' bundles (dist/webview/<entry>/main.js), for the browser.
// A script, not the esbuild CLI: standard-ui imports stylesheets as text (`….css?inline`,
// Vite's convention), which needs a plugin. The stylesheet itself is the Tailwind CLI's
// (package.json, build:webviews).
import { readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import * as path from 'node:path'
import { build } from 'esbuild'

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname))
const require = createRequire(path.join(root, 'package.json'))

/** `import css from 'x.css?inline'` → the file's text. */
const inlineCss = {
    name: 'inline-css',
    setup(builder) {
        builder.onResolve({ filter: /\.css\?inline$/ }, args => ({
            path:      require.resolve(args.path.replace(/\?inline$/, ''), { paths: [args.resolveDir] }),
            namespace: 'inline-css',
        }))
        builder.onLoad({ filter: /.*/, namespace: 'inline-css' }, async args => ({
            contents: await readFile(args.path, 'utf8'),
            loader:   'text',
        }))
    },
}

// From scratch: chunk names change with their content, and old ones would pile up in the package.
await rm(path.join(root, 'dist', 'webview'), { recursive: true, force: true })

// One file per webview, no code splitting: Blueprint (the table viewer) imports its icon set
// statically, and split into chunks that's a thousand-odd module requests through the
// webview's service worker before the page renders. One file loads at once.
for (const entry of ['preview', 'components'])
    await build({
        absWorkingDir: root,
        entryPoints:   [`webviews/${entry}/main.tsx`],
        outfile:       `dist/webview/${entry}/main.js`,
        bundle:        true,
        format:        'esm',
        platform:      'browser',
        target:        'es2022',
        jsx:           'automatic',
        minify:        true,
        define:        { 'process.env.NODE_ENV': '"production"' },
        // One React for everything: standard-ui and Blueprint would otherwise each find their own copy.
        alias:         { 'react': './node_modules/react', 'react-dom': './node_modules/react-dom' },
        plugins:       [inlineCss],
        logLevel:      'warning',
    })
