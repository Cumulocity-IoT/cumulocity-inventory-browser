# Cumulocity Inventory Browser — Requirements

## 1. Purpose

A standalone Cumulocity app to navigate/browse the tenant's
[Inventory API](https://cumulocity.com/api/core/#tag/Inventory-API) — its Managed Objects — as
raw JSON, using components from the [Codex](https://cumulocity.com/codex/) library.

## 2. Entry point

Exploring starts either by **selecting** a device/group from the tree, or by **searching** for one.

## 3. Layout

Reference layout: [../attic/Screenshot 2026-08-26 at 20.55.32.png](../attic/Screenshot%202026-08-26%20at%2020.55.32.png)
(crossed-out elements are out of scope; green-boxed elements are in scope).

- **Left navigation** (Cumulocity's own left Navigator sidebar, not a separate panel in the app's
  main content area): search box + a tree listing all groups and devices.
- **Main panel**: the JSON view of the selected Managed Object, with an Identities section below it.
- **Top action bar**: Back / Parent / Prev / Next / Refresh (§6, §7).

Out of scope: Home, Devices list, Overviews, Smart Rules, Alarms, Measurements, Events, Control,
Availability tabs, dashboards/widgets. (Note: "Identity" crossed out in the reference screenshot
is Device Management's built-in Identity *tab* — the app's own Identities section, §5, is a
different, in-scope thing.)

## 4. JSON view

- Renders the selected Managed Object's full JSON using the Codex **Editor** component
  (https://cumulocity.com/codex/components/forms/editor/overview, `c8y-editor`, Monaco-based) —
  read-only, no inline editing.
- Any reference-shaped node in the JSON (an object with `self`+`id`, or a `managedObject`
  sub-object with `id` — as found in `childDevices`/`childAssets`/`childAdditions`/`deviceParents`/
  `assetParents`/`additionParents`) is a **clickable link** that navigates to that Managed Object.

## 5. Identities

Below the JSON view, an **Identities** section lists the selected Managed Object's external IDs
(via the [Identity API](https://cumulocity.com/api/core/#tag/Identity-API)) as a Type / External
ID table. Rows are **plain text, not links** — an identity's `managedObject` reference always
points back to the object already shown, so making it clickable was a no-op that read as broken.

## 6. Left navigation / tree

- Root shows tenant-wide **groups and devices** (not groups only — a standalone device with no
  group parent must still be reachable by browsing).
- Expandable per node; children are lazily loaded.
- **"Only devices & groups" switch** (default **on**): filters plain, non-device/group assets out
  of the tree's children and search results.
- **Search** matches the Managed Object's **name** (contains) or **type** (contains), or an exact
  **id** — not a generic full-text search.
- **Refresh** (top action bar, right side): clears the search box, collapses the tree back to its
  root and reloads it, and clears the currently open Managed Object/navigation history.

## 7. Top action bar

- **Back**: returns to the previously viewed Managed Object.
- **Parent**: navigates to the current object's parent (device parent, else asset parent).
- **Prev / Next**: when the current object was reached by clicking a reference inside a
  `references[]` array, steps to the previous/next entry of that same array.
- **Refresh**: see §6.

## 8. Query behavior

Per the Inventory API's list-endpoint query options:

- List-type requests (search, tree root, tree children) request `withChildren: false` (they never
  render nested child stubs) and `withParents: true`.
- The single-object detail fetch (loading the currently open object) explicitly requests
  `withChildren: true`, regardless of the tenant's `core.inventory.without.children` feature
  toggle default — the reference-link, Prev/Next, and Parent navigation all depend on it.

## 9. Branding

- App display name: **"Inventory Browser"**, independent of the underlying package/deployment name.
- The page title includes the name of the currently displayed Managed Object.
