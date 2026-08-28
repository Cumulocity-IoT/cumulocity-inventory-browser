import { Component, Input, effect, inject } from '@angular/core';
import { IManagedObject } from '@c8y/client';
import { IconDirective } from '@c8y/ngx-components';
import { managedObjectIcon } from '../shared/managed-object-icon.util';
import { InventoryNavigationService } from '../state/inventory-navigation.service';

@Component({
  selector: 'app-inventory-tree-node',
  standalone: true,
  imports: [IconDirective, InventoryTreeNodeComponent],
  templateUrl: './inventory-tree-node.component.html',
  styleUrl: './inventory-tree-node.component.scss',
})
export class InventoryTreeNodeComponent {
  private readonly nav = inject(InventoryNavigationService);

  @Input({ required: true }) node!: IManagedObject;

  expanded = false;
  loaded = false;
  loading = false;
  children: IManagedObject[] = [];

  get icon(): string {
    return managedObjectIcon(this.node, this.expanded);
  }

  /** Highlights this node when it's the currently-open Managed Object. */
  get isActive(): boolean {
    return this.nav.currentObject()?.id === this.node.id;
  }

  constructor() {
    // Auto-expand down to the current selection: InventoryNavigationService.revealIds() carries
    // the selected object's id plus every ancestor id resolved so far. If this node is one of
    // those ancestors, it's on the path to the selection — expand it (which renders its children,
    // letting whichever *those* is next in the chain pick up the same check via its own instance
    // of this same effect, cascading down). The selection itself doesn't need this — it's already
    // rendered once its parent expands, and isActive highlights it — so it's excluded to avoid an
    // unnecessary extra childrenOf() fetch for a node the user isn't browsing into.
    effect(() => {
      const ids = this.nav.revealIds();
      if (!this.expanded && ids.has(this.node.id) && this.node.id !== this.nav.currentObject()?.id) {
        void this.expand();
      }
    });
  }

  async toggle(event: Event): Promise<void> {
    event.stopPropagation();
    if (this.expanded) {
      this.expanded = false;
      return;
    }
    await this.expand();
  }

  private async expand(): Promise<void> {
    this.expanded = true;
    if (this.loaded) {
      return;
    }
    this.loading = true;
    try {
      // Already filtered to devices/groups and sorted by name — see InventoryNavigationService.childrenOf().
      this.children = await this.nav.childrenOf(this.node.id);
    } finally {
      this.loading = false;
      this.loaded = true;
    }
  }

  select(): void {
    void this.nav.open(this.node.id);
  }
}
