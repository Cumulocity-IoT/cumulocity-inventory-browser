import { Component, OnInit, effect, inject } from '@angular/core';
import { IManagedObject } from '@c8y/client';
import { InventoryTreeNodeComponent } from './inventory-tree-node.component';
import { InventoryNavigationService } from '../state/inventory-navigation.service';

@Component({
  selector: 'app-inventory-tree',
  standalone: true,
  imports: [InventoryTreeNodeComponent],
  templateUrl: './inventory-tree.component.html',
  styleUrl: './inventory-tree.component.scss',
})
export class InventoryTreeComponent implements OnInit {
  protected readonly nav = inject(InventoryNavigationService);
  private firstRefreshSignal = true;

  rootNodes: IManagedObject[] = [];

  constructor() {
    // The refresh action lives in the top action bar (InventoryBrowserComponent), a sibling
    // mounted in the main content area, not an ancestor of this tree (which is mounted as the
    // "Groups" navigator node's own component) — so it can't call this component directly and
    // instead bumps InventoryNavigationService.refreshRequested, which this effect reacts to.
    effect(() => {
      this.nav.refreshRequested();
      if (this.firstRefreshSignal) {
        this.firstRefreshSignal = false;
        return;
      }
      void this.reloadFromScratch();
    });
  }

  ngOnInit(): void {
    void this.loadRootNodes();
  }

  async loadRootNodes(): Promise<void> {
    this.rootNodes = await this.nav.rootNodes();
  }

  /**
   * Collapses the whole tree back to its root — clearing `rootNodes` before refetching tears down
   * every `InventoryTreeNodeComponent` (with its own expanded/loaded child state) rather than
   * reusing them, so previously-expanded groups collapse.
   */
  private async reloadFromScratch(): Promise<void> {
    this.rootNodes = [];
    await this.loadRootNodes();
  }
}
