# Quarry — Code-writing guidelines

These rules apply to all code written or changed in this repository. Follow them
when implementing features, scaffolding, refactoring, and fixing bugs. Scaffolding
must meet the same standard as finished code.

The user's explicit instructions take precedence. Preserve established Quarry
architecture and naming. Use PretzelGraph's source as the reference for frontend
code organization and writing style; adapt its patterns to Quarry's domain and
Blueprint components.

## 1. Inspect before writing

- Read the relevant design documents in `docs/design/` before changing a domain.
- Read neighboring implementations from end to end: domain contract, API client,
  controller, service, repository, SDK, and UI where applicable.
- Before substantial architectural changes, explain the proposed file layout,
  responsibility boundaries, and how the change fits existing patterns.
- Do not introduce a new abstraction merely because it is convenient to generate.
  Explain what concrete problem it solves and why the established pattern is
  insufficient before adding it.
- Preserve unrelated changes. Do not edit PretzelGraph or PretzelCloud while using
  them as references for Quarry.

## 2. Formatting and spacing are requirements

- Use four spaces for indentation in new TypeScript, TSX, JSON, and HTML files.
- Match the surrounding file's quote and semicolon conventions. New frontend
  TypeScript uses single quotes and no semicolons, matching the inspected
  PretzelGraph frontend examples. Do not rewrite unrelated code to enforce this.
- Put each statement on its own line. Never pack multiple assignments, state
  updates, function calls, or control-flow steps onto one line.
- Put each property of a nontrivial object or type on its own line.
- Separate logical steps with blank lines: reading state, validating, making an
  API call, updating state, invalidating queries, and returning a result.
- Separate class members, sibling operations, and helper declarations with blank
  lines. Leave a blank line after a class or namespace declaration before its
  first member.
- Align related type fields and object properties where it improves scanning,
  following the neighboring code. Do not align unrelated statements.
- Keep lines around 120 characters where practical. Break expressions, argument
  lists, and JSX props at natural boundaries. Do not compress code to hit a file
  size or line-count target.
- Short getters and simple expression-bodied functions may remain on one line.
  Functions containing several steps must have readable blocks.
- Do not use nested ternaries for branching logic. Name the intermediate value or
  use explicit `if` or `switch` branches.

```ts
// Avoid
const data = await Source.get(api, rid); setState(s => { s.sources[rid] = data.source }); return data

// Use
const data = await Source.get(api, rid)

setState(state => {
    state.sources[rid] = data.source
})

return data
```

## 3. JSX must expose the component structure

- Use `return (...)` for JSX containing children, conditions, or multiple elements.
- Put meaningful nested elements on separate lines, indented to show ownership.
- Expand components with substantial props or callbacks across multiple lines.
- Keep conditionals and list rendering visibly separate from surrounding content.
- A simple leaf element may stay on one line. Do not put a form, dialog, table,
  component tree, or a long conditional expression on one line.
- Extract meaningful controls, branches, and sections into named components when
  they make the parent easier to understand. Do not extract every trivial element.
- Put nontrivial event-handler logic in a named function before the JSX.
- Give component props a named interface or type when they contain several fields.
  Do not crowd the function signature with a long inline props type.

```tsx
return (
    <FormGroup label='Name' labelFor={inputId}>
        <InputGroup
            id={inputId}
            value={name}
            onChange={handleNameChange}
        />
    </FormGroup>
)
```

## 4. Files have clear responsibilities

- Keep SDK assembly in `sdk.ts`, side-effectful operations in `actions.ts` or
  `actions/`, derived reads in `selectors.ts`, and feature UI in `ui/`.
- Split an actions folder by domain entity when one file becomes difficult to
  navigate. Do not create a folder hierarchy without enough code to justify it.
- Keep component rendering, schema/default-value helpers, hooks, and formatting
  utilities separate when they have distinct responsibilities.
- Do not accumulate unrelated components, hooks, domain operations, and utilities
  in a generic `common` file. A barrel may re-export focused implementations.
- Keep route modules focused on route configuration, data preparation, and page
  composition. Feature behavior belongs in its SDK and feature UI.

## 5. Types and names communicate the domain

- Reuse the domain types and API contracts from `@quarry/shared`.
- Use domain RID types instead of plain strings when the value is a known RID.
  Name them `rid`, `sourceRid`, `datasetRid`, and similar; do not rename RIDs to IDs.
- Use explicit types for public action contracts, SDK state, and component props.
  Allow inference for straightforward local values.
- Follow the `FeatureSDKImpl` / `FeatureSDK.State` / `FeatureSDK.Actions` pattern.
  Expose selectors through the same namespace when the SDK has selectors.
- Prefer names such as `source`, `request`, `state`, and `resources` over opaque
  abbreviations when the scope contains several steps.
- Do not use `any`, double casts, or non-null assertions to hide a missing check or
  an incorrect design. Validate unknown values at boundaries and narrow them.
- Name operational constants such as stale times, polling intervals, and request
  timeouts. Keep their meaning and units clear.

## 6. Follow the existing frontend state pattern

- Wrap feature state in typed SDK classes backed by Zustand and Immer.
- Register every SDK in the SDK container (`@quarry/standard-ui/SDKs/SDKManager`, tsyringe, after
  PretzelGraph): `@SDK('Name')` on the class, `export const XSDK = SDK.get<XSDKImpl>('Name')`. An SDK that
  needs another resolves it with `SDK.get<OtherSDKImpl>('Other')` and a type-only import, rather than
  importing its instance (which can close an import cycle) or wiring it from the other SDK's actions.
- Use the established shallow-equality store pattern for selectors returning
  arrays or objects. Do not create unstable subscriptions that repeatedly render.
- SDK classes assemble the store, action factories, selectors, and query
  definitions. Do not put every API call inline in the SDK class.
- Actions visibly perform their steps: call the shared API, update the store,
  invalidate relevant queries when necessary, and return the result.
- Group related actions by domain responsibility, such as `source`, `sync`, and
  `run`, as in PretzelGraph's entity-oriented action factories.
- Each action group is a class extending `ActionGroup` (`SDKs/core/actions.ts`). The SDK's actions are a class
  too — `XActions extends ActionGroup` in `actions/index.ts`, holding the groups as fields
  (`readonly source = new SourceActions(this.sdk)`) — and the SDK has `actions = new XActions(this)`.
  Callers keep `XSDK.actions.source.create(...)`.
  Each group names its log once, like a server service
  (`protected readonly log = log.withContext('DataConnection.Actions.Sync')`). A write action handles its own
  failure, as PretzelGraph's do: `try { … } catch (error) { this.log.error('create failed', describeError(error));
  NotificationSDK.toast.error("Couldn't create source", { description: errorMessage(error) }); throw error }`.
  Log `describeError(error)`, never the raw error (it carries the session token and request body). Rethrow,
  so the caller can still react (keep its dialog open). Reads (query functions) don't notify — their screen
  shows the failed load. Don't also show a notified failure inline.
- Do not add reducers just for symmetry. Direct Immer updates in actions are
  sufficient while state is shallow. Introduce reducers when nested state or
  genuinely shared transitions make them useful.
- Read `SDK.state` inside callbacks and asynchronous operations. Subscribe with
  `useStore` only to data the component needs for rendering.
- Selectors derive values; they do not fetch, mutate, or perform side effects.

## 7. TanStack Query owns request state

- Declare query keys, query functions, stale times, and polling policy in the SDK's
  `query` object. Do not duplicate them across components.
- Use `SDK.useWith(selector, query => [...])` to combine store selection with query
  subscriptions. Destructure individual query results into meaningful names.
- Handle `isPending`, `isLoading`, `isFetching`, `error`, and `refetch` explicitly
  where the screen needs them. Distinguish initial loading from a background
  refresh; do not unnecessarily discard usable data during a refresh.
- Do not introduce a generic query-state renderer that obscures those decisions.
- Do not copy request status into Zustand or add parallel loading/error state for
  a query TanStack Query already manages.
- Keep shared domain data in the SDK store; TanStack Query manages request
  lifecycle, freshness, caching, retries, and prefetching.
- Store or cache only, per PretzelGraph: put an entity in the SDK store when it is
  shared by RID, read by several screens or SDKs, changed locally (by actions or
  other SDKs' events), or derived from by selectors (PretzelGraph: library metas,
  gateway connections, vault credentials). Leave read-only results that belong to
  one screen and its parameters in the query cache only: the action returns the
  response without `setState`, the selector is `() => null`, and the component
  reads `request.data` (PretzelGraph: publication history, resource-loader
  options; Quarry: dataset views and previews). Don't keep the same data in both.
- Use `fetch` when subsequent logic needs populated store state. Use `prefetch`
  for nonblocking preparation. Do not replace an awaited route dependency with
  fire-and-forget loading.
- Use the shared QuerySDK client and provider; do not create feature-specific
  QueryClient instances.

```tsx
const [projects, [projectsRequest]] = LibrarySDK.useWith(
    LibrarySDK.selectors.projects,
    query => [query.projects],
)

if (projectsRequest.isPending && projects.length === 0)
    return <ProjectsSkeleton />

if (projectsRequest.isError)
    return <ProjectsError error={projectsRequest.error} />
```

## 8. Routing and authentication follow PretzelGraph's patterns

- Use TanStack Router's file-based routes when wiring the frontend. Do not invent
  a parallel navigation system or use component state as a substitute for routes.
- Let the router plugin generate the route tree; never hand-edit generated output.
- An app's routes live in its own folder, `src/apps/<app>/routes/`, mounted at `/<app>` by
  `src/routes.config.ts`; `src/routes/` holds only the shell's routes (root, workspace layout, auth, playground).
- Pass typed auth state through router context. Put access checks in route
  `beforeLoad` hooks, with public paths explicitly identified.
- Initialize auth before protected route loaders run. Keep bootstrap/loading UI
  separate from the routed application.
- Distinguish session existence from workspace access: `hasSession` and
  `access: 'checking' | 'granted' | 'denied' | 'unreachable'`.
- A failed network request does not prove the user is signed out. Handle an
  unreachable API separately from an authentication or membership refusal.
- Keep GoTrue token handling in the shared auth client/API interceptor path.
  Components must not construct authorization headers themselves.
- Clear session-scoped SDK state and the shared query client centrally when auth
  ends. Review pending requests and subscriptions so old-session work cannot
  repopulate cleared state. Do not scatter cleanup across logout buttons.
- Do not add session wrappers, request frameworks, or auth abstractions without
  first explaining why the existing approach cannot handle the actual case.

## 9. UI and async behavior stay explicit

- Use Blueprint for UI controls and Tailwind for layout and spacing. Reuse
  established Quarry components before adding wrappers around the library.
- Follow the existing dialog ownership and composition pattern. Do not introduce
  another dialog framework or manager when one already exists.
- Dialogs belong to their SDK, as in PretzelGraph: `SDKs/<X>SDK/dialogs/<entity>-dialogs.tsx` exports
  `open<Verb><Entity>Dialog(args)`, which pushes the dialog (`DialogSDK.actions.push`); the dialog's
  component stays private to that file. `dialogs/index.ts` collects them in `_create<X>Dialogs_()`, and the SDK
  exposes `public readonly dialogs`. Screens call `XSDK.dialogs.openCreateFolder({ … })` — never push dialogs
  themselves, and never keep dialog components in `ui/`.
- Keep form validation, submission, pending state, success, and failure paths easy
  to identify. Do not hide them in dense callbacks or nested expressions.
- Keep credential values local to the form or operation that needs them. Do not
  persist revealed secrets in general SDK stores, query caches, or logs.
- Show actionable failures. Do not swallow errors silently or report success when
  an operation failed. A catch may omit duplicate UI reporting only when the
  responsible layer already reports the failure.

## 10. Preserve Quarry's backend boundaries

- Controllers validate contracts; services own business orchestration;
  repositories own SQL and transactions.
- Only the server accesses Quarry's application database. Workers use the
  existing internal API contracts.
- Services call other services' public interfaces, not their repositories or DB
  modules. Repositories do not call other repositories or nest transactions.
- Preserve the caller's principal through service and repository calls. Use
  service principals only for actual system work.
- Keep resource creation atomic through the existing `@Transactional` and
  `@EnsureResource` pattern.
- Preserve RLS for plain row access. Use `@SecurityGate` or explicit assertions for
  business rules and effects RLS cannot express, as documented in Gatekeeper.
- Follow the existing liveness and `@AllowTrashed` rules instead of adding ad hoc
  checks or bypasses.

## 11. Comments and verification

- Keep code comments short, factual, and usually one line. Describe behavior or a
  necessary constraint. Put extended design explanations in documentation.
- Do not add apology comments, conversation history, dated progress notes, or
  essays explaining routine code.
- Read the finished files before presenting them. Passing a formatter or
  typecheck does not establish readable code or architectural fit.
- Check every changed file for compressed statements, dense JSX, vague names,
  misplaced responsibilities, and unnecessary abstractions.
- Run the relevant package typecheck and required checks. Run a build when build
  wiring changes. Use meaningful behavioral checks when behavior changes.
- Do not add tests that merely mirror formatting or trivial implementation details.
- Run `git diff --check` and inspect new files too. Preserve unrelated work.
- Report verification accurately: distinguish source inspection, typechecking,
  builds, mocked behavior, and live integration testing.
- Do not call a scaffold runnable until its entry point, routes, providers,
  styles, and startup commands are wired and verified.
