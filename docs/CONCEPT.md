# Cumulocity Inventory Browser — Concept

Formalizes [REQUIREMENTS.md](REQUIREMENTS.md) into the design this app is actually built against.
Originally written 2026-08-26, revised 2026-08-27 to match what shipped (see §10 for what changed
from the first draft and why).

## 1. Purpose

A standalone Cumulocity app for browsing the tenant's **Inventory API** as raw JSON, letting a user
drill from a Groups tree (or search) into a Managed Object, then hop through its references
(children, parents, additions) via clickable links — without leaving the JSON view.

## 2. Runtime & tech stack

- Angular 21, `@c8y/ngx-components` / `@c8y/client` 1024.15.16, `@c8y/bootstrap`, `@c8y/devkit`.
- The Angular project lives in **[`browser/`](../browser)**, not the repo root.
- **Standalone deployment, not an embedded Cumulocity plugin.** `main.ts` / `bootstrap.ts` wire up
  `@c8y/bootstrap`'s `loadMetaDataAndPerformBootstrap`, which renders Cumulocity's own
  tenant/user/password login screen before bootstrapping `BootstrapComponent`. After login,
  `@c8y/client` calls run against that authenticated session/cookie.
- The app's **display name** ("Inventory Browser") is set via `cumulocity.config.ts`'s
  `runTime.name`, decoupled from `package.json`'s `name` — the latter still drives the app's
  `contextPath`/`key` (URL and deployment identity), which is left untouched.

## 3. Screen layout

No Cumulocity global navigator items beyond a single "Groups" entry, no right-hand tabs (Home,
Devices, Overviews, Smart Rules, Alarms, Measurements, Events, Control, Availability are all out
of scope, per the original screenshot):

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ [< Back] [↑ Up] [< Prev] [Next >]                                   [Refresh]  │ (action bar)
├───────────────┬──────────────────────────────────────────────────────────────────┤
│ ─────────────  │           Search fields + results                │
│ Groups tree    │───────────────────────────────────────────────────│
│  ├ Group A     │           JSON View (selected Managed Object)     │
│  │  ├ Device 1 │           - clickable reference links             │
│  │  └ Device 2 │           - read-only, via the Codex Editor       │
│  └ Group B     │───────────────────────────────────────────────────│
│ [Load more]    │           Identities                              │
│                │           - Type / External ID table              │
│                │           - plain text, not clickable             │
└───────────────┴───────────────────────────────────────────────────┘
```

Unlike the original draft, the tree is **not** a panel inside the app's own main content area — it
is mounted directly inside Cumulocity's real left Navigator sidebar (see §4). The search fields
started out alongside it there too, but moved to the main content area, above the JSON view (§3.1a
below), so it reads as "search across the tenant, see results here" rather than being visually
part of the tree.

The tree and search results are both permanently restricted to devices/groups (`isDeviceOrGroup`,
§3.1/§3.1a) — an "Only devices & groups" switch used to make this optional, living in the top
action bar since it was shared state read by two separately-mounted components, but a filter that's
always been the useful default in practice didn't earn its keep as a user-facing toggle; it was
removed and the filtering is now unconditional.

### 3.1 Navigator — tree (`InventoryTreeComponent`)

- Root: **only root device groups** — `list({ fragmentType: 'c8y_IsDeviceGroup', onlyRoots: true })`.
  `onlyRoots` is the Inventory API's own way of excluding groups that already have a parent (per
  [the docs](https://cumulocity.com/api/core/#operation/getManagedObjectCollectionResource)) — this
  matches how Device Management's own Groups navigator scopes its root list (its
  `@c8y/ngx-components/assets-navigator` package, mirrored here rather than depended on: see
  `AssetNodeService`). Standalone devices with no group parent are reachable via search (§3.1a),
  not the tree — matching Device Management's own split between "Devices" and "Groups".
- **Paginated root list, not one unbounded request.** Since a tenant can have a large number of
  top-level groups, `rootGroups()` returns the full `IResultList` (not just `.data`), page size 20
  (mirroring `AssetNodeService.PAGE_SIZE`), and `InventoryTreeComponent` holds onto `.paging` to
  fetch more via a "Load more" button beneath the root list — the same `paging.next()`-driven
  pattern used by search (§3.1a), not a separate mechanism.
- Expandable per node via `childAssets`/`childDevices` (lazy-loaded on first expand, cached after
  that; not paginated — only the *root* list needed this, per the above). Selecting any node loads
  it into the JSON view and pushes it onto history.
- Children are filtered to devices/groups (`isDeviceOrGroup`) and **sorted alphabetically by name**
  (case-insensitive, falling back to id) server-response-side in `InventoryNavigationService.childrenOf`
  — `InventoryTreeNodeComponent` just renders what it's given, no client-side filtering left in the
  component. Root groups are sorted the same way, re-sorted across the accumulated list after each
  "Load more" (`shared/sort-managed-objects.util.ts`'s `sortByName`).
- **Highlights the current selection** (`InventoryTreeNodeComponent.isActive`, node id ===
  `nav.currentObject()?.id`) — but only when that node is already rendered (a loaded root group, or
  a child of an already-expanded group); it doesn't by itself reveal a selection made elsewhere
  (search, a JSON reference link) that isn't currently visible.
- **Reveal-in-tree**: auto-expands the ancestor chain down to whatever's currently selected, so a
  search result (or any navigation) doesn't leave the tree looking unrelated to what's open.
  `InventoryNavigationService.revealIds` is a plain `computed()` off `currentObject`'s own
  `deviceParents`/`assetParents.references` — **not** an extra fetch or a level-by-level walk. That
  only works because `load()`'s `detail()` call passes `withParents: true`, which turned out to be
  required (confirmed against a real tenant) for `deviceParents`/`assetParents` to come back
  populated *at all* on the single-object GET, not just the list endpoint — an earlier version of
  this code assumed the direct parent was included by default (matching what the Up/Parent button
  had always relied on) and was simply wrong: without `withParents`, a non-root object's own
  ancestor references come back as empty arrays. That bug had been silently masked wherever Up used
  the sibling-context `originId` fallback instead (§`parentTargetId`) — any array-descent navigation
  always sets that, so the broken fallback path was rarely exercised — but it meant Up/Parent (and,
  before this fix, reveal-in-tree) was actually broken for any object reached without sibling
  context (direct search selection, first navigation into the tree). With `withParents: true`, the
  response carries *every* ancestor in one shot (per the docs, "all ancestors from all levels
  above"), so `revealIds()` needs no network calls of its own at all. Two effects consume it, and
  nothing calls into the other directly — the cascade is entirely reactive:
  - `InventoryTreeComponent` pages through the root list (the same `loadMore()` a user would click)
    until one of `revealIds()` shows up among `rootGroups`, or there's no more to load.
  - Every `InventoryTreeNodeComponent`, once *its own* `node.id` is in `revealIds()` (and isn't the
    selection itself — no need to expand the very node being highlighted), auto-expands and
    fetches its children — which is what lets the *next* ancestor's own node component (now
    rendered) notice its id is in the set and expand in turn, cascading down the chain without any
    parent/child component needing a reference to the other.
  A selection with no reachable root ancestor simply never gets revealed — no error, the tree just
  doesn't expand toward it.
  - **Bounded paging.** The "top" of an ancestor chain is just whatever object has no further
    parent — it isn't guaranteed to itself carry `c8y_IsDeviceGroup`, so it isn't guaranteed to
    ever appear in the `onlyRoots`-filtered root list `InventoryTreeComponent` is paging through.
    `hasMore` alone doesn't catch that case — it only reflects whether the *server* has more pages,
    not whether continuing is worth it — so `ensureRevealedRootLoaded` also caps itself at
    `MAX_REVEAL_LOAD_MORE_ATTEMPTS` (15) "Load more" calls, persistent for the tree's lifetime
    (reset on Refresh, not per attempt). Without it, a selection whose root ancestor isn't itself a
    device group pages through the tenant's *entire* root-group list looking for an id that will
    never show up — observed in practice as 300+ requests in a row.

### 3.1a Main panel — search (`InventorySearchComponent`)

Above the JSON view, in the main content area (not the Navigator), three independent searches
grouped into **two** `<fieldset>`s (each with a `<legend>` naming what it matches) wrapping Codex
`c8y-form-group` fields — labeled inputs, not bare placeholder-only ones. Name/id/type and "has
fragment" share one fieldset ("Match name, id, type, or fragment") since both are free-text/wildcard
matches against a single object property each — closer in kind to each other than to the exact-pair
external-ID lookup, which keeps its own fieldset. Grouping by query *kind*, not fieldset-per-query,
is what makes the "these are independent queries, but two of them are the same shape" relationship
visible rather than merely documented. The fieldsets lay out side by side (wrapping on narrow
widths) and feed **one merged results list** below all three searches:

- **Name/id/type fields**: matches the Managed Object's `name` (wildcard contains) or `type`
  (wildcard contains), or an exact `id`, via the Inventory API's query language —
  `listQuery({ __or: [{ name: '*term*' }, { id: term }, { type: '*term*' }] })`, not the generic
  full-text `text` filter.
- **"Has fragment" field**: matches objects that *have* a given top-level fragment defined (e.g.
  `ec_Geo`, `c8y_Position`), via `listQuery({ __has: fragmentName })` (the query language's
  existence check, [per the docs](https://cumulocity.com/api/core/#section/Supported-sort-operations)).
  Deliberately a **separate query**, not OR'd/AND'd into the field above — existence-of-a-fragment
  and contains-this-text are different kinds of match, and combining them into one query object
  would either return an unrelated mishmash (OR) or silently make the name/id/type search stricter
  whenever this field has a value (AND). Two simple, independent queries.
- **External ID type + value fields**: an *exact* lookup, not a wildcard search — the
  [Identity API](https://cumulocity.com/api/core/#tag/Identity-API)'s
  `GET /identity/externalIds/{type}/{externalId}` (`IdentityService.detail`) is keyed by the exact
  (type, externalId) pair, so both fields are required before anything runs
  (`InventoryNavigationService.findByExternalId`), and there's at most one result. That response
  only carries the matched managed object's `id`/`self` (no `name`), so a second, lightweight
  `inventory.detail()` fetch resolves the name for display — one extra request only when a match is
  found, since there's never more than one.
- **Merged results**: all three independent result sets are combined and deduplicated by id
  (`merge-search-results.util.ts`'s `mergeSearchResults`, taking a `MatchSource[]` —
  `{ reason, items }` per search — so adding the external-ID source didn't change the two existing
  ones' call sites beyond wrapping them), each row carrying `id`/`object`/`matchReasons`. Three
  side-by-side, visually-identical result boxes would make it unclear *why* a given result showed
  up in one or another — each row instead shows a folder/microchip icon (group vs. device) and a
  small badge per query it matched (`name/id/type`, `fragment`, `external id`, any combination if an
  object satisfied more than one). This addresses that confusion without collapsing the *searches*
  into one ambiguous query — only their *display* is unified. The tree (§3.1) remains a separate,
  further way to reach a Managed Object, since it's a fundamentally different mode (hierarchical
  browse vs. flat lookup), not merged into this.
- **Rendered with `c8y-data-grid`** (`DataGridComponent`), not the earlier `c8y-list-group`/`c8y-li`
  list — client-side `[rows]="mergedResults()"` with two columns (`name` — icon + name/id via an
  inline `*c8yCellRendererDef` template; `matches` — the reason badges), `[displayOptions]`
  disabling the grid's own header/filter/footer chrome (this isn't a full data table, just a
  results list), and `(rowClick)` driving `nav.open()`. The grid's *own* built-in pagination footer
  is turned off (`footer: false`) because it only paginates the client-side `rows` array already in
  memory — it can't fetch more from the independent underlying queries. `mergedResults`/
  `gridPagination` are Angular `computed()`s, not plain getters — a getter re-evaluated every
  change-detection pass returns a *new* array/object each time even when nothing changed, which the
  grid reads as "the data changed" and reloads on, visible as constant flicker; `computed()` only
  produces a new reference when a signal it reads actually changed. `gridPagination`'s `pageSize` is
  pinned to the current result count (`Math.max(mergedResults().length, 1)`), since with the grid's
  footer hidden there'd be no way to reach a "next page" of the grid's *own* if a default page size
  ever truncated the (already fully in-memory) list.
- **"Load more"**: `InventoryNavigationService.search`/`searchByFragment` return the full
  `IResultList<IManagedObject>` (not just `.data`) precisely so `InventorySearchComponent` can hold
  onto each query's `.paging` and call `.paging.next()` — the `@c8y/client` `Paging` class's own
  next-page method (the external-ID lookup has no paging — at most one result). A single "Load
  more" button below the grid is enabled while *either* the name/id/type or fragment query still
  has another page — `shared/paging.util.ts`'s `hasNextPage(page)`, which checks `paging.nextPage`,
  **not** `paging.currentPage < paging.totalPages` (an earlier version of this code did, and the
  button silently never appeared: `totalPages`/`totalElements` are only populated when the request
  passes `withTotalPages: true`, an opt-in none of our list queries make, so `totalPages` is
  `undefined` and that comparison is always `false` regardless of how many more results exist).
  Clicking "Load more" advances whichever quer(ies) do have a next page, in parallel, and appends
  the newly returned items to the accumulated `results`/`fragmentResults` signals that
  `mergedResults` is computed from — so page 2+ items merge and dedupe against page 1 the same way.
  Both queries use a 20-item page size (`SEARCH_PAGE_SIZE`). The tree's root-groups "Load more"
  (§3.1) uses the same `hasNextPage` helper.
- All three search sources are filtered to devices/groups (`isDeviceOrGroup`), and all three clear
  (boxes + results + accumulated pages) on the `refreshRequested` signal (§5) on Refresh.
- Selecting any result loads it into the JSON view exactly like clicking a tree node.

### 3.2 Main panel — JSON view (`ManagedObjectViewComponent`)

- Rendered with Cumulocity's Codex **Editor** component (`c8y-editor` /
  `@c8y/ngx-components/editor`, Monaco-based), in read-only JSON mode — not a custom recursive
  JSON tree. The component is bound imperatively (`editor.setValue(text)`) rather than via
  `[ngModel]`, so the app fully controls the exact text and can compute link ranges against it.
- `json-serializer.util.ts`'s `serializeWithLinks(value)` pretty-prints byte-identical to
  `JSON.stringify(value, null, 2)` while walking the same tree to record the character range of
  every **reference-shaped node** (`reference-link.util.ts`: an object with `self`+`id`, or a
  `managedObject` sub-object with `id` — as seen in `childDevices.references[]`,
  `childAssets.references[]`, `childAdditions.references[]`, `deviceParents.references[]`,
  `assetParents.references[]`, `additionParents.references[]`). The root value is never treated as
  a reference, and once an ancestor is recognized as one, its own nested `self`/`id`-shaped
  descendants (e.g. its `managedObject` sub-object) are not double-linked.
- Those ranges become Monaco decorations (underlined) via `editor.deltaDecorations`; a
  `mousedown` handler hit-tests the click position against the same ranges to trigger navigation,
  and `mousemove` toggles a hover/cursor class.
- Non-goal: the JSON is **read-only** (no inline editing).

### 3.3 Main panel — Identities section (`IdentitiesComponent`)

Below the JSON view, an **Identities** section lists the external IDs registered for the currently
selected Managed Object, fetched via the
[Identity API](https://cumulocity.com/api/core/#tag/Identity-API) (`IdentityService.list(id)`,
which internally hits `GET /identity/globalIds/{id}/externalIds`).

- Rendered as a table: **Type** and **External ID** per entry.
- Rows are **plain text, not links** — an identity's `managedObject` reference always points back
  to the object already open, so making it clickable was a no-op that read as broken.
- Empty state: "No identities".
- Fetched alongside the Managed Object whenever the JSON view's selection changes (own request,
  in parallel with the `detail()` call).

### 3.4 Layout sizing

`.inventory-browser` (in `InventoryBrowserComponent`) gets an **explicit `height: 85vh`** —
deliberately not left to resolve through a `flex-grow` chain up through the app shell
(`main#main-content`, `.container-fluid`, …), none of which ever resolves a definite height; that
chain, combined with Monaco's `automaticLayout` measuring on mount, previously collapsed the
editor to near-zero height. An explicit `vh` value on this one outer container sidesteps the whole
chain, and *within* it, ordinary flexbox works fine since the container itself now has a definite
height to distribute.

Inside that container, `.resizable-region` (`flex: 1 1 auto; min-height: 0`) holds all three
panels — search results, JSON view, Identities — separated by **two independent draggable
horizontal dividers**:

- `InventorySearchComponent` itself is sized by an explicit `searchHeightPx` property
  (`InventoryBrowserComponent`), bound via `[heightPx]` → `[style.height.px]` on its own root div.
  *Within* that fixed height, the component's own internal flex column keeps the two search input
  fields at their natural size (`flex: 0 0 auto`) and lets only the results list
  (`.search-results`, `flex: 1 1 auto; overflow: auto`) grow/shrink/scroll — so dragging this
  divider resizes the results list, never hides the input fields (`MIN_SEARCH_HEIGHT_PX` also keeps
  a floor for exactly that reason).
- The JSON view's height is an explicit `topHeightPx` component property, bound via
  `[style.height.px]` directly on `<app-managed-object-view>`'s host — `ManagedObjectViewComponent`'s
  own `:host`/`.json-editor` just fill that with `height: 100%` (inline styles win over the
  component's own stylesheet, so the parent-set height always applies). The empty/loading state
  (`.hint`) does the same, so the layout doesn't jump once an object is selected.
- Identities is `flex: 1 1 auto; min-height: 0; overflow: auto` — it simply fills whatever's left,
  no explicit height needed.
- Each **divider** (a plain `<div class="divider">`, `cursor: row-resize`, `role="separator"`) drives
  its own height (`searchHeightPx` or `topHeightPx`) on `mousedown`/`mousemove`/`mouseup` (listeners
  on `document`, added/removed per drag rather than left permanently attached, tracked by a single
  `resizing: 'search' | 'json' | null` field so only one divider is ever live at a time), clamped
  against the *other* panel's current height plus both dividers' heights and `MIN_BOTTOM_HEIGHT_PX`
  (the region's actual height is measured via `ElementRef.getBoundingClientRect()` on drag, not
  assumed). Each chosen height persists to its own `localStorage` key
  (`inventory-browser.search-results-height-px` / `inventory-browser.json-view-height-px`) on drag
  end, read back as the initial value via a shared `readStoredHeight(key, fallback, min)` helper.
- No existing Codex component fits this: `c8y-resizable-grid` (`ResizableGridComponent`) is the
  same idea but for a **left/right** split only, not top/bottom, so it wasn't reusable here.

Search result rows are rendered `[dense]="true"` (a built-in `ListItemComponent` input for a
tighter row style) plus a small host-level padding override in `inventory-search.component.scss`,
so more results fit in whatever height the divider above leaves for the list.

## 4. Navigator & routing integration

Cumulocity apps built on `CoreModule` don't register routes/navigator entries via a plain Angular
`Routes` array passed to `RouterModule.forRoot()` — that array is not what the app shell's
`RouterService`/`NavigatorService` actually consult. `app.routes.ts` instead exports
`inventoryBrowserProviders`, added to `app.config.ts`'s root providers:

```ts
hookRoute({ path: '', component: InventoryBrowserComponent })
hookNavigator({ label: 'Groups', path: '', icon: 'folder', priority: 100, component: InventoryTreeComponent })
```

Setting `component: InventoryTreeComponent` on the navigator node fully replaces that node's
default label/expander rendering with the search+tree UI (`NavigatorNodeComponent`'s template:
`@if (node.component) { <ng-container *c8yComponentOutlet="node.component" /> }`) — this is what
puts the search+tree inside the real left Navigator sidebar.

`IdentityService` is not auto-provided by `CoreModule` (unlike `InventoryService`), so
`app.config.ts` adds it explicitly via a `FetchClient`-backed factory provider.

## 5. Top action bar

Implemented with `c8y-action-bar-item` (icons via the `c8yIcon` directive, not raw CSS classes).

| Control | Behavior |
|---|---|
| **Back** | Pops the navigation history stack (§6.1) and re-renders the previous Managed Object. Disabled when history is empty. |
| **Up** (labeled "Parent" in code identifiers — `canGoParent`/`parent()` — but "Up" in the UI, since it no longer always means the inventory-hierarchy parent) | Navigates to the Managed Object the user actually descended *from*: the origin of the `references[]` array a link was clicked from (§6.2's `SiblingContext.originId`), when there is one. Falls back to the object's own inventory-hierarchy parent (`deviceParents.references[0]`, else `assetParents.references[0]`) only when there's no sibling context at all (reached via tree/search instead of a reference link). The two usually agree, but not always — an object reached via e.g. `childAdditions` can have empty `deviceParents`/`assetParents` even though the user clearly came from somewhere, which is why array-descent takes priority. Disabled when neither is available. |
| **Prev / Next** | Enabled when the current object was reached by clicking a reference **inside a `references[]` array**. Moves to the previous/next entry of that same array by index. Disabled at the array's start/end or when there's no active sibling context. |
| **Refresh** (right side) | "Start new": calls `InventoryNavigationService.refresh()`, which resets navigation state (clears the current object/history, same as an empty `reset()`) and bumps a `refreshRequested` signal. `InventoryTreeComponent` and `InventorySearchComponent` — both mounted separately from `InventoryBrowserComponent`, which hosts this button — each react to that signal via their own `effect()` to reload/collapse the tree and clear the search boxes, since neither can be called directly. |

`<c8y-title>` (also from `@c8y/ngx-components`) shows `Inventory View`, or
`Inventory View — <name>` once a Managed Object is selected.

## 6. Navigation state (`InventoryNavigationService`)

Signal-based (`currentObject`, `identities`, `history`, `siblingContext`, `loading`, plus computed
`canGoBack`/`canGoParent`/`canGoPrev`/`canGoNext`), wraps `InventoryService` + `IdentityService`.

### 6.1 History stack (Back)

A LIFO stack of visited Managed Object IDs (plus sibling context to restore Prev/Next state),
pushed on every navigation (tree click, search select, reference-link click, parent click,
prev/next click). "Back" pops one entry and re-renders it without pushing a new one.

### 6.2 Sibling context (Prev/Next)

```ts
interface SiblingContext {
  referenceArray: ReferenceNode[]; // the references[] array the click came from
  index: number;                   // position of the clicked entry within it
  originId: string;                // id of the Managed Object whose JSON held that array — used by Parent
}
```

`referenceArray`/`index` are computed once per `references[]` array by `json-serializer.util.ts`
while serializing (all reference-shaped items of that array, in order) and attached to each item's
`JsonLink`; `originId` is read off `nav.currentObject()` at click time, in
`ManagedObjectViewComponent`, before navigating away. Clicking a link passes all three through to
`nav.open(id, siblingContext)`; it travels with the history entry so Back also restores the correct
Prev/Next state, and `originId` is what Parent (§5) prefers over the inventory-hierarchy lookup.
Navigating via the tree, search, or Parent clears the sibling context — landing via Parent is
treated the same as a fresh tree/search entry, not as "one more step in the array."

## 7. Inventory API query tuning

- **List-type queries** (`search`, `searchByFragment`, `rootGroups`, `childrenOf`) pass
  `withChildren: false` (they
  only ever render `name`/`id`/the device-or-group fragments, never nested child stubs) and
  `withParents: true` (every list item also carries its device/asset parent references).
- **The `detail()` fetch** (loading the currently-open object) explicitly passes
  `withChildren: true` — not left to the API default, because the reference-link navigation,
  Prev/Next, and Parent button all depend on `childDevices`/`childAssets`/`childAdditions` being
  populated in that response, and a tenant with the `core.inventory.without.children` feature
  toggle enabled would otherwise silently return them empty.

## 8. Data model (from sample payloads)

Confirmed against `attic/1605043`, `attic/PxC-BPC-9202S-2038479027`, and
`attic/167516492619E3_R1_withPartents.json`: standard Cumulocity Managed Object shape — `id`,
`name`, `type`, `owner`, `creationTime`, `lastUpdated`, fragment data (e.g. `c8y_Hardware`,
`c8y_Position`, `c8y_SoftwareList`, `c8y_ActiveAlarmsStatus`), and the reference collections
`childDevices`, `childAssets`, `childAdditions`, `deviceParents`, `assetParents`,
`additionParents` — each `{ self, references: [{ self, managedObject: { self, id, name } }] }`.

Identity API (`GET /identity/globalIds/{id}/externalIds`) response shape:
`{ externalIds: [{ self, externalId, type, managedObject: { self, id } }] }`.

## 9. Component breakdown (as built)

`src/app/inventory/` is grouped by semantic subarea rather than kept flat, so a file's directory
tells you what it's part of:

```
inventory/
  inventory-browser.component.{ts,html,scss}   routed root: action bar (incl. the devices/groups switch) + <c8y-title> + JSON view + Identities
  state/                                        shared navigation/session state
    inventory-navigation.service.{ts,spec.ts}   §6
    inventory.model.ts                          ReferenceNode/SiblingContext/HistoryEntry/IdentityEntry
  tree/                                          the "Groups" navigator-node UI
    inventory-tree.component.{ts,html,scss,spec.ts}       root list
    inventory-tree-node.component.{ts,html,scss}          recursive node: expand/collapse, lazy child fetch, select
  search/                                        the search UI, mounted in the main content area
    inventory-search.component.{ts,html,scss,spec.ts}     3 searches / 2 fieldsets + merged results grid
    merge-search-results.util.{ts,spec.ts}                mergeSearchResults(sources: MatchSource[])
  json-view/                                     the JSON panel
    managed-object-view.component.{ts,html,scss} hosts c8y-editor; owns Monaco decorations + click/hover handling
    json-serializer.util.{ts,spec.ts}            serializeWithLinks
  identities/
    identities.component.{ts,html,scss}          external-ID table, read-only
  shared/                                         pure helpers used by more than one subarea
    reference-link.util.{ts,spec.ts}             extractReferenceNode/isReferenceNode
    managed-object-filter.util.{ts,spec.ts}      isDeviceOrGroup
    sort-managed-objects.util.{ts,spec.ts}       sortByName
    paging.util.{ts,spec.ts}                     hasNextPage (checks paging.nextPage, not totalPages)
```

`InventoryBrowserComponent` stays at the `inventory/` root since it's the composition root
(registered via `hookRoute`, §4) rather than belonging to any one subarea; it directly hosts
`InventorySearchComponent` (§3.1a), while `InventoryTreeComponent` is registered separately via
`hookNavigator`'s `component` (also §4) despite living under `tree/`.

## 10. What changed from the original draft, and why

- **Routing/navigator registration**: the original draft assumed `RouterModule.forRoot(routes)`
  with `hookNavigator` nested in a route's own `providers`. That route was never actually
  registered with the app shell's `RouterService`, so nothing rendered at all (blank page, empty
  navigator) — fixed by using `hookRoute`/`hookNavigator` as top-level app providers (§4).
- **Tree placement**: originally a panel in the main content area; moved into the real Navigator
  sidebar via `NavigatorNode.component` once it became clear that's where "left navigation listing
  all groups and devices" was expected to live (§3.1, §4).
- **JSON view**: originally a hand-built recursive renderer; replaced with the Codex Editor
  component per explicit requirement, with a custom serializer to keep link/sibling tracking
  working against Monaco's plain-text model (§3.2).
- **Identities links**: originally spec'd as clickable (§3.3 in the first draft); removed after
  it became clear an identity's `managedObject` is always the currently-open object, making the
  link a confusing no-op.
- **Root tree scope**: originally groups only; broadened to devices+groups so standalone devices
  are reachable by browsing (§3.1).
- **Search**: originally the generic `text` full-text filter; narrowed to `name`
  (wildcard-contains) + exact `id` via the query language (§3.1).
- **Devices/groups filter switch**: added after the fact, not in the original draft.
- **Layout height**: went through a flex-grow-based 2:1 split that repeatedly collapsed to near
  zero height; settled on independent `vh` units instead (§3.4).
