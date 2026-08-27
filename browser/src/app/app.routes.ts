import { Provider } from '@angular/core';
import { hookNavigator, hookRoute } from '@c8y/ngx-components';
import { InventoryBrowserComponent } from './inventory/inventory-browser.component';
import { InventoryTreeComponent } from './inventory/tree/inventory-tree.component';

/**
 * Cumulocity apps built on CoreModule don't register routes/navigator entries via a plain
 * Angular `Routes` array passed to `RouterModule.forRoot()` — that array is not what the app
 * shell's `RouterService`/`NavigatorService` actually consult. Routes and navigator nodes must
 * be contributed via `hookRoute`/`hookNavigator` providers instead.
 *
 * The "Groups" node's `component` is set to InventoryTreeComponent, which fully replaces that
 * node's default label/expander rendering with our search+tree UI (see NavigatorNodeComponent's
 * template: `@if (node.component) { <ng-container *c8yComponentOutlet="node.component" /> }`) —
 * this is how the search+tree ends up inside the real left Navigator sidebar instead of a
 * separate panel in the main content area.
 */
export const inventoryBrowserProviders: Provider[] = [
  hookRoute({ path: '', component: InventoryBrowserComponent }),
  hookNavigator({ label: 'Groups', path: '', icon: 'folder', priority: 100, component: InventoryTreeComponent }),
];
