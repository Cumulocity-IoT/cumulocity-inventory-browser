import { Component, Input, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IManagedObject } from '@c8y/client';
import { ListGroupComponent, ListItemComponent, ListItemIconComponent } from '@c8y/ngx-components';
import { filterDevicesAndGroups } from '../shared/managed-object-filter.util';
import { managedObjectIcon } from '../shared/managed-object-icon.util';
import { InventoryNavigationService } from '../state/inventory-navigation.service';
import { SearchResultRow, mergeSearchResults } from './merge-search-results.util';

@Component({
  selector: 'app-inventory-search',
  standalone: true,
  imports: [FormsModule, ListGroupComponent, ListItemComponent, ListItemIconComponent],
  templateUrl: './inventory-search.component.html',
  styleUrl: './inventory-search.component.scss',
})
export class InventorySearchComponent {
  protected readonly nav = inject(InventoryNavigationService);

  /** Total height of this component (search fields + results list), set by InventoryBrowserComponent's divider. Null = auto height (e.g. in tests). */
  @Input() heightPx: number | null = null;

  private searchDebounce?: ReturnType<typeof setTimeout>;
  private fragmentDebounce?: ReturnType<typeof setTimeout>;
  private firstRefreshSignal = true;

  searchTerm = '';
  searching = false;
  results: IManagedObject[] = [];

  fragmentTerm = '';
  fragmentSearching = false;
  fragmentResults: IManagedObject[] = [];

  get mergedResults(): SearchResultRow[] {
    const onlyDevicesAndGroups = this.nav.onlyDevicesAndGroups();
    return mergeSearchResults(
      filterDevicesAndGroups(this.results, onlyDevicesAndGroups),
      filterDevicesAndGroups(this.fragmentResults, onlyDevicesAndGroups)
    );
  }

  get anySearchActive(): boolean {
    return !!this.searchTerm.trim() || !!this.fragmentTerm.trim();
  }

  get anySearchInFlight(): boolean {
    return this.searching || this.fragmentSearching;
  }

  constructor() {
    // "Start new" (the Refresh action-bar button) should clear both searches too.
    effect(() => {
      this.nav.refreshRequested();
      if (this.firstRefreshSignal) {
        this.firstRefreshSignal = false;
        return;
      }
      this.searchTerm = '';
      this.results = [];
      this.fragmentTerm = '';
      this.fragmentResults = [];
    });
  }

  onSearchInput(): void {
    clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => void this.runSearch(), 300);
  }

  onFragmentInput(): void {
    clearTimeout(this.fragmentDebounce);
    this.fragmentDebounce = setTimeout(() => void this.runFragmentSearch(), 300);
  }

  select(id: string): void {
    void this.nav.open(id);
  }

  resultIcon(row: SearchResultRow): string {
    return managedObjectIcon(row.object);
  }

  private async runSearch(): Promise<void> {
    const term = this.searchTerm.trim();
    if (!term) {
      this.results = [];
      return;
    }
    this.searching = true;
    try {
      this.results = await this.nav.search(term);
    } finally {
      this.searching = false;
    }
  }

  private async runFragmentSearch(): Promise<void> {
    const term = this.fragmentTerm.trim();
    if (!term) {
      this.fragmentResults = [];
      return;
    }
    this.fragmentSearching = true;
    try {
      this.fragmentResults = await this.nav.searchByFragment(term);
    } finally {
      this.fragmentSearching = false;
    }
  }
}
