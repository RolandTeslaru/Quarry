# Quarry standard-ui

Shared React components, icons, theme styles, and DialogSDK, adapted from PretzelGraph.
The package exports TypeScript source for Vite to compile, matching PretzelGraph's package layout.

```tsx
import { Button } from '@quarry/standard-ui/foundations/button'
import { Select } from '@quarry/standard-ui/foundations/select'
import { DialogSDK } from '@quarry/standard-ui/SDKs/DialogSDK'
import '@quarry/standard-ui/index.css'
```

`src/foundations/` owns components, `src/icons/` owns the Blueprint SVG loader, and
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

## Non-ideal states

`NonIdealState` composes the existing `Empty` foundations for empty lists, searches,
missing access, and failures. It accepts Blueprint icon names or a custom
React element, with `title`, `description`, `action`, and optional `children`.

```tsx
import { NonIdealState } from '@quarry/standard-ui/foundations/nonIdealState'
import { Button } from '@quarry/standard-ui/foundations/button'

<NonIdealState
    icon='folder-close'
    title='No projects yet'
    description='Create a project to get started.'
    action={<Button intent='primary'>Create project</Button>}
/>
```

The default icon size is 48px and `layout` defaults to `vertical`; `horizontal`
places the icon beside the content. `iconMuted` defaults to true and applies a
15% fill (20% in dark mode), a 50% outline, and a fixed 1px stroke across SVG grids.
Set `iconMuted={false}` to preserve the icon's normal appearance. Icons are
decorative; supply accessible text in the title or description.

## Blueprint icons

The package uses `@blueprintjs/icons` without Blueprint Core or its CSS. The old
custom icon collection has been removed. Icon names use Blueprint's kebab-case
names, including `add`, `tick`, `chevron-down`, `database`, and `projects`.

```tsx
import { Icon, LazyIcon, type IconName } from '@quarry/standard-ui/icons'

<Icon name='projects' size={48} />
<LazyIcon name='cog' />
<Button icon='add' endIcon='arrow-right'>Create dataset</Button>
```

`Icon` and `LazyIcon` are the same renderer. It loads the individual glyph's 16px
or 20px SVG paths when mounted, caches the result by name and grid, and deduplicates
concurrent requests. Sizes below 20px use the 16px grid; larger icons use the 20px
grid. An empty SVG reserves its dimensions while loading. Failed requests are
logged without interrupting the surrounding controls. Decorative icons are hidden
from accessibility APIs; provide `title`, `aria-label`, or `aria-labelledby` for a
standalone meaningful icon. Icon-only buttons still need their own accessible label.

Button and NonIdealState icon slots accept typed names or custom React elements.
DialogSDK icon slots accept typed names or custom SVG components.

The generated registry covers the pinned Blueprint version. After upgrading that
dependency, run `npm run generate:icons --workspace=packages/standard-ui`, then
run the package typecheck and frontend build. The registry imports individual path
modules, so it does not eagerly import the entire SVG collection or icon fonts.
