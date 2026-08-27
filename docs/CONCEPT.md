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
│ [< Back] [↑ Up] [< Prev] [Next >]          [Only devices & groups ⚬] [Refresh]  │ (action bar)
├───────────────┬──────────────────────────────────────────────────────────────────┤
│ ─────────────  │           Search box + results                   │
│ Groups tree    │───────────────────────────────────────────────────│
│  ├ Group A     │           JSON View (selected Managed Object)     │
│  │  ├ Device 1 │           - clickable reference links             │
│  │  └ Device 2 │           - read-only, via the Codex Editor       │
│  └ Group B     │───────────────────────────────────────────────────│
│                │           Identities                              │
│                │           - Type / External ID table              │
│                │           - plain text, not clickable             │
└───────────────┴───────────────────────────────────────────────────┘
```

Unlike the original draft, the tree is **not** a panel inside the app's own main content area — it
is mounted directly inside Cumulocity's real left Navigator sidebar (see §4). The search box
started out alongside it there too, but moved to the main content area, above the JSON view (§3.1a
below), so it reads as "search across the tenant, see results here" rather than being visually
part of the tree. The "Only devices & groups" switch also started in the Navigator sidebar, then
moved into the top action bar (right side, next to Refresh, §5) — it filters both the tree (§3.1)
and search results (§3.1a), and having it live in either one of those two separately-mounted
components was arbitrary; the action bar is neutral ground both can read from equally.

### 3.1 Navigator — tree (`InventoryTreeComponent`)

- Root: tenant-wide `c8y_IsDeviceGroup` **and** `c8y_IsDevice` objects (two parallel queries,
  merged) — not just groups, so a standalone device with no group parent is still reachable by
  browsing, not only via search.
- Expandable per node via `childAssets`/`childDevices` (lazy-loaded on first expand, cached after
  that). Selecting any node loads it into the JSON view and pushes it onto history.
- Filters its children by the shared `onlyDevicesAndGroups` signal (§5) — has no visible effect at
  the root level, which is always restricted to devices+groups already (see above); it matters for
  a group's children, which can include plain, non-device/group assets.

### 3.1a Main panel — search (`InventorySearchComponent`)

Above the JSON view, in the main content area (not the Navigator), two independent search fields
side by side in one row, feeding **one merged results list** below both:

- **Name/id/type field**: matches the Managed Object's `name` (wildcard contains) or `type`
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
- **Merged results**: the two independent result sets are combined and deduplicated by id
  (`merge-search-results.util.ts`'s `mergeSearchResults`) into a single list, rendered with the
  Codex list components (`c8y-list-group`/`c8y-li`/`c8y-li-icon`) instead of a plain `<ul>`. Two
  side-by-side, visually-identical result boxes made it unclear *why* a given result showed up in
  one or the other — each row now shows a folder/microchip icon (group vs. device) and a small
  badge per query it matched (`name/id/type`, `fragment`, or both, if an object satisfied both).
  This addresses that confusion without collapsing the two *searches* into one ambiguous query —
  only their *display* is unified. The tree (§3.1) remains a separate, third way to reach a Managed
  Object, since it's a fundamentally different mode (hierarchical browse vs. flat lookup), not
  merged into this.
- Both fields filter their results by the same shared `onlyDevicesAndGroups` signal (§5), and both
  clear (box + results) on the same `refreshRequested` signal as the tree (§5) on Refresh.
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
| **"Only devices & groups" switch** (`c8y-switch`, right side, default **on**) | Toggles `InventoryNavigationService.onlyDevicesAndGroups` (via `setOnlyDevicesAndGroups`). Filters out plain, non-device/group assets client-side, at render time, against already-fetched lists — toggling doesn't trigger a new network request. Read by both `InventoryTreeComponent` (§3.1) and `InventorySearchComponent` (§3.1a), two separately-mounted components with no parent/child relationship, which is why the state lives on the shared service rather than either component. Bound via plain `[checked]`/`(change)`, not `[ngModel]`/`(ngModelChange)` — a one-way signal read (`[ngModel]="someSignal()"`) paired with a custom write-back handler reliably failed to push its *initial* value into the checkbox's DOM `checked` property (confirmed via a failing `TestBed` test; the write-back direction worked fine, only the initial read direction didn't); `[checked]`/`(change)` sidesteps `ControlValueAccessor` entirely and isn't affected. |
| **Refresh** (right side) | "Start new": calls `InventoryNavigationService.refresh()`, which resets navigation state (clears the current object/history, same as an empty `reset()`) and bumps a `refreshRequested` signal. `InventoryTreeComponent` and `InventorySearchComponent` — both mounted separately from `InventoryBrowserComponent`, which hosts this button — each react to that signal via their own `effect()` to reload/collapse the tree and clear the search box, since neither can be called directly. |

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

- **List-type queries** (`search`, `rootNodes`, `childrenOf`) pass `withChildren: false` (they
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
    inventory-search.component.{ts,html,scss,spec.ts}     two search fields + merged results list
    merge-search-results.util.{ts,spec.ts}                mergeSearchResults
  json-view/                                     the JSON panel
    managed-object-view.component.{ts,html,scss} hosts c8y-editor; owns Monaco decorations + click/hover handling
    json-serializer.util.{ts,spec.ts}            serializeWithLinks
  identities/
    identities.component.{ts,html,scss}          external-ID table, read-only
  shared/                                         pure helpers used by more than one subarea
    reference-link.util.{ts,spec.ts}             extractReferenceNode/isReferenceNode
    managed-object-filter.util.{ts,spec.ts}      isDeviceOrGroup/filterDevicesAndGroups
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
