import { Component, Input, inject } from '@angular/core';
import { IManagedObject } from '@c8y/client';
import { IconDirective } from '@c8y/ngx-components';
import { filterDevicesAndGroups } from '../shared/managed-object-filter.util';
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
  @Input() onlyDevicesAndGroups = false;

  expanded = false;
  loaded = false;
  loading = false;
  children: IManagedObject[] = [];

  get icon(): string {
    return managedObjectIcon(this.node, this.expanded);
  }

  get visibleChildren(): IManagedObject[] {
    return filterDevicesAndGroups(this.children, this.onlyDevicesAndGroups);
  }

  async toggle(event: Event): Promise<void> {
    event.stopPropagation();
    this.expanded = !this.expanded;
    if (this.expanded && !this.loaded) {
      this.loading = true;
      try {
        this.children = await this.nav.childrenOf(this.node.id);
      } finally {
        this.loading = false;
        this.loaded = true;
      }
    }
  }

  select(): void {
    void this.nav.open(this.node.id);
  }
}
