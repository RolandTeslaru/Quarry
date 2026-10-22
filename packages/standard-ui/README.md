# Quarry standard-ui

Shared React components, icons, theme styles, and DialogSDK, adapted from PretzelGraph.
The package exports TypeScript source for Vite to compile, matching PretzelGraph's package layout.

```tsx
import { Button } from '@quarry/standard-ui/foundations/button'
import { Select } from '@quarry/standard-ui/foundations/select'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import '@quarry/standard-ui/index.css'
```

`src/foundations/` owns components, `src/icons/` owns system icons, and
`src/SDKs/DialogSDK/` owns the managed dialog store, actions, selectors, and templates.
DialogSDK has no dependency on Quarry's frontend or its request layer.

`index.css` includes Tailwind, the preset, theme styles, and explicit scanning of
this package's source. Consumers using their own Tailwind entry can import
`@quarry/standard-ui/styles.css`, use `@quarry/standard-ui/tailwind-preset`, and
register this package's `src/` directory with Tailwind themselves. React, React DOM,
and Tailwind are peer dependencies.

The playground imports the full stylesheet only in its standard-ui preview document;
Blueprint retains its own stylesheet and theme. The existing radius, colors,
selection states, popup animations, and dialog behavior are preserved.

Run `npm run typecheck --workspace=packages/standard-ui` from the repository root.
The frontend build verifies package exports and stylesheet integration.
