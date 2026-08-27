# Cumulocity Inventory Browser

A standalone Cumulocity app for browsing the tenant's [Inventory API](https://cumulocity.com/api/core/#tag/Inventory-API)
as raw, navigable JSON. Drill from a Groups tree (or search) into a Managed Object, then hop
through its references (children, parents, additions) via clickable links, without leaving the
JSON view.

See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for the requirements and
[docs/CONCEPT.md](docs/CONCEPT.md) for the design/architecture this app is built against.

## Features

- **Groups tree** in the real Cumulocity left Navigator: search by name/id, expandable tree of
  groups and devices, with an "Only devices & groups" switch to filter out plain assets.
- **JSON view** of the selected Managed Object, rendered with Cumulocity's Codex Editor
  (Monaco-based, read-only), with clickable reference links (`childDevices`, `childAssets`,
  `childAdditions`, `deviceParents`, `assetParents`, `additionParents`).
- **Identities** section listing the selected object's external IDs.
- **Top action bar**: Back / Parent / Prev / Next, including sibling stepping through whichever
  `references[]` array a link was clicked from.

## Project layout

The Angular application lives in [`browser/`](browser), not the repo root — all commands below
must be run from that directory:

```bash
cd browser
npm install
```

`attic/` holds working notes, requirements, sample Cumulocity payloads, and the concept doc; it
is not part of the deployed app.

## Development server

This app uses `@c8y/devkit`'s dev server (not the stock Angular CLI dev server), which proxies to
a real Cumulocity tenant and requires a login via `@c8y/bootstrap`'s built-in login screen — there
is no local mock backend.

```bash
npm start
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The
application will automatically reload whenever you modify any of the source files.

## Building

To build the project run:

```bash
npm run build
```

This will compile the project and store the build artifacts in `dist/`, using `@c8y/devkit`'s
build pipeline (which also bundles the Monaco editor's language workers into `dist/monaco-workers`).

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
npm test
```

## Deploying

```bash
npx ng deploy
```

Uses the `deploy` architect target (`@c8y/devkit:deploy`, configured in `angular.json`) to package
and upload the app to a Cumulocity tenant.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the
[Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
