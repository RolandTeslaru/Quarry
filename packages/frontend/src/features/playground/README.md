# UI playground

Open `/playground` for 46 aligned comparisons of PretzelGraph standard-ui and Blueprint. No sign-in or API data is required. Search filters both columns; the appearance switch changes both themes; synchronized scrolling can be disabled.

Each half is a separate same-origin document at `/playground/standard` or `/playground/blueprint`. This keeps PretzelGraph's Tailwind preflight, theme variables, and portal styles separate from Blueprint. The parent receives measured row heights so corresponding examples stay aligned as controls expand or fonts load. Dialogs remain inside their respective halves.

## PretzelGraph snapshot

`packages/standard-ui/src/` was copied from the local PretzelGraph checkout on 2026-10-22, whose HEAD was `92cbd49882a999950eaabba4493dee1a6f048d01`. The snapshot includes the checkout's current file contents, including any local edits, rather than a published package. PretzelGraph itself is not modified and is not required to build Quarry.

The snapshot includes its foundation components, global styles, Tailwind preset, and frontend `index.css`. The playground imports the workspace package as `@quarry/standard-ui`. Its `index.css` registers the package source with Tailwind; the React Flow stylesheet import is omitted because this page has no graph canvas. The original React Flow-specific CSS rules remain. Icons now use the standalone `@blueprintjs/icons` package through standard-ui's cached per-glyph loader, with no dependency on Blueprint Core in standard-ui. Frontend startup configures Blueprint's own icon loader to share that cache, avoiding loading an entire size collection for its native controls.

The initial snapshot preserved component styling and motion. Quarry now uses an 8px base corner radius with a proportional 2–16px scale. Search inputs, switches, and slider tracks and thumbs retain their fully rounded shapes; other controls use the shared radius scale. Files are formatted for Quarry; narrow typing fixes remove unchecked casts in the alert buttons and form contexts, type slider pointer events, and narrow DOM elements. Application-specific `WindowStyling` and the internal `Example` layout helpers are excluded from the component comparison.

## Organization

- `catalog.ts` lists component pairs, categories, and minimum row heights.
- `ui/Playground.tsx` owns the comparison controls and frames.
- `ui/Preview.tsx` renders one column and measures its rows.
- `ui/standard-*.tsx` and `ui/blueprint-*.tsx` contain interactive examples.
- `preview-messages.ts` validates the small frame communication protocol.

The overlay examples use Blueprint's `PopoverNext`, the implementation supported under React 19; the legacy `Popover` reports incorrect positioning under React 19 StrictMode. Blueprint compositions and missing direct equivalents are labeled explicitly. Examples use local state and make no changes to workspace resources. The standard-ui and Blueprint date libraries intentionally retain their respective React Day Picker versions.

Standard-ui Select, Popover, and the DropdownMenu root share Blueprint's popup motion: scale from 30% to 100% over 300ms with `cubic-bezier(0.54, 1.12, 0.38, 1.11)`, and fade over 100ms with `cubic-bezier(0.4, 1, 0.75, 0.9)`. Closing reverses both values. Radix supplies the transform origin; the fade holds its final value until the scale finishes so the surface remains mounted for 300ms. Reduced-motion preferences shorten both animations to 1ms. DropdownMenu submenus retain their original 95% scale, fade, and directional slide.

The Select comparison includes a flat Select and a four-level cascading dataset picker with shared options, a selected path, and a disabled leaf. Cascading selection is composed from standard-ui DropdownMenu and Blueprint PopoverNext/MenuItem; it does not extend either flat Select API.

Select, DropdownMenu, Popover items, ContextMenu, Menubar, and CommandBar use neutral `secondary` backgrounds for hover and keyboard focus. Selected Select options and checked menu radio/checkbox items use a 15% `primary` background with `foreground` text and icons, including during hover or keyboard focus. Item borders stay transparent; warning and destructive items retain their semantic text colors.

The color sheet at the top of both columns displays live surface, text, border, interaction, and button intent swatches. Values resolve to sRGB hex with opacity shown separately and update with the shared appearance setting. Standard colors use the current Quarry package theme; Blueprint colors use its CSS variables and rendered Card, InputGroup, and Button backgrounds. Search for `color` to isolate the sheets.

## Floating pointer

`packages/standard-ui/src/foundations/floatingPointer.tsx` exports the raw `FloatingPointer` SVG. Its `.floating-pointer` styles in `packages/standard-ui/src/styles.css` own the curved shape's size, fill, and border. The component contains no positioning or popup behavior.

Select, Popover, and root DropdownMenu Content compose it through their respective Radix `Arrow` primitives. Radix positions and rotates the pointer and includes it in the animation origin. Each Content accepts `pointer={false}` to omit it and `arrowPadding` to keep it away from rounded corners. Select only renders a pointer with `position='popper'`; submenus keep their original motion and have no pointer.

The shared CSS variables are `--floating-pointer-width`, `--floating-pointer-height`, `--floating-pointer-background`, and `--floating-pointer-border`. Fill and border default to the popover theme tokens. Select retains scrolling in its Viewport; DropdownMenu uses an inner scroll container so the pointer is not clipped.

## Managed dialogs

The standard preview includes PretzelGraph's DialogSDK pattern under `packages/standard-ui/src/SDKs/DialogSDK/`, with one `UIOverlay` mounted in `StandardPreview`. Its Zustand/Immer store owns ordered dialog entries; callers use `actions.push`, `actions.pop`, and `actions.popAll`. Closing entries remain mounted for the 400ms removal delay, and reopening an ID cancels its pending removal. Preview teardown clears the stack and timers.

The copied templates are `Template`, `AlertTemplate`, `UnstyledTemplate`, `SplitTemplate`, `TripleSplitTemplate`, and `TabsTemplate`. They preserve PretzelGraph's entry delay, stack scaling and vertical offsets, background dimming, and separate split-surface treatment. DialogSDK owns its store accessors and uses a direct singleton, with no dependency on the frontend's query layer or PretzelGraph's SDK registry. Rendering lives in `ui/`, operations in `actions.ts`, and derived reads in `selectors.ts`.

The dialog and confirmation rows demonstrate all six templates, including opening another dialog without discarding the underlying form. The confirmation row uses `AlertTemplate`. Blueprint retains its own Dialog/Alert examples. Both sides remain local previews with no workspace mutations.

## Button API

The Quarry copy separates appearance (`variant`) from color (`intent`). Defaults are `variant='solid'`, `intent='none'`, and `size='default'`. Icon-only buttons automatically use `icon-sm` unless a size is provided.

- Variants: `solid`, `neon`, `outlined`, `minimal`.
- Core intents: `none`, `primary`, `success`, `warning`, `danger`.
- Additional color intents: `accent`, `active`, `ai`, `message`.
- Solid buttons with `intent='none'` use the same `input` background token as Select triggers.
- Solid success, warning, and danger buttons use opaque fills and defined borders. Their previous tinted backgrounds and colored text are preserved by `variant='neon'`. Neon primary uses the soft sky-blue palette.
- Solid primary buttons use an opaque sky-blue fill, white text, and a defined border, with a darker tint in dark mode. The `active` intent keeps its softer tint. Shared primary and focus colors also use sky blue.
- `minimal` is a boolean shorthand for `variant='minimal'` and takes precedence when true.
- `icon` and `endIcon` accept typed Blueprint names, such as `add` or `arrow-right`, or React elements. Icon-only buttons need an accessible label.
- `active` controls the selected appearance and `aria-pressed`; it is independent of the sky-colored `active` intent.
- Loading disables native buttons and marks composed elements disabled and busy. Composed elements also block click handling while disabled or loading.

```tsx
<Button>Cancel</Button>
<Button intent='primary' icon='add'>Create dataset</Button>
<Button variant='neon' intent='success'>Connected</Button>
<Button variant='outlined' intent='danger'>Delete</Button>
<Button minimal endIcon='arrow-right'>Continue</Button>
<Button icon={<Icon name='cog' />} aria-label='Settings' />
```

Color and sizing rules live in `packages/standard-ui/src/foundations/button.styles.ts`; rendering, icon resolution, and event handling live in `button.tsx`. Dialog actions, calendar controls, and input-group buttons use the same API.

The old combined variants have been migrated: `default` becomes `intent='primary'`, `outline` becomes `variant='outlined'`, `ghost` becomes `minimal`, and `destructive` becomes `intent='danger'`. Colored ghost variants become `minimal` plus the corresponding intent. The former neutral `secondary` appearance is covered by the default `none` intent. For a text link, compose an anchor with `asChild`, `minimal`, and optional underline classes.
