import { Component, EventEmitter, Input, Output, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IManagedObject, IResultList } from '@c8y/client';
import {
  CellRendererContext,
  CellRendererDefDirective,
  Column,
  ColumnDirective,
  DataGridComponent,
  FormGroupComponent,
  IconDirective,
  Pagination,
} from '@c8y/ngx-components';
import { managedObjectIcon } from '../shared/managed-object-icon.util';
import { hasNextPage } from '../shared/paging.util';
import { InventoryNavigationService } from '../state/inventory-navigation.service';
import { MatchSource, SearchResultRow, mergeSearchResults } from './merge-search-results.util';

@Component({
  selector: 'app-inventory-search',
  standalone: true,
  imports: [FormsModule, IconDirective, DataGridComponent, ColumnDirective, CellRendererDefDirective, FormGroupComponent],
  templateUrl: './inventory-search.component.html',
  styleUrl: './inventory-search.component.scss',
})
export class InventorySearchComponent {
  protected readonly nav = inject(InventoryNavigationService);

  /** Total height of this component (search fields + results list), set by InventoryBrowserComponent's divider. Null = auto height (e.g. in tests). */
  @Input() heightPx: number | null = null;

  /** Emits when the results list collapses to / expands from its one-line summary, so the parent can hide its resize divider. */
  @Output() readonly collapsedChange = new EventEmitter<boolean>();

  /** True once a result was picked: the list shrinks to a "N matches" chip until the user searches again or expands it. */
  readonly collapsed = signal(false);

  protected readonly displayOptions = {
    striped: true,
    bordered: false,
    gridHeader: true,
    filter: true,
    hover: true,
    footer: false,
  };

  protected readonly columns: Column[] = [
    { name: 'name', header: 'Name', path: 'object.name', sortable: true, filterable: true, gridTrackSize: '1fr' },
    { name: 'type', header: 'Type', path: 'object.type', sortable: true, filterable: true, gridTrackSize: '1fr' },
    { name: 'id', header: 'ID', path: 'object.id', sortable: true, filterable: true, gridTrackSize: '140px' },
    { name: 'matches', header: 'Matched by', path: 'matchReasons', sortable: false, filterable: false, gridTrackSize: '160px' },
  ];

  // Long enough to type a full search string (id, name, or serial number) without firing a
  // request per keystroke or cutting the user off mid-word.
  private static readonly SEARCH_DEBOUNCE_MS = 800;

  private searchDebounce?: ReturnType<typeof setTimeout>;
  private fragmentDebounce?: ReturnType<typeof setTimeout>;
  private externalIdDebounce?: ReturnType<typeof setTimeout>;
  private firstRefreshSignal = true;

  searchTerm = '';
  searching = false;
  readonly results = signal<IManagedObject[]>([]);
  private resultsPage: IResultList<IManagedObject> | null = null;

  fragmentTerm = '';
  fragmentSearching = false;
  readonly fragmentResults = signal<IManagedObject[]>([]);
  private fragmentResultsPage: IResultList<IManagedObject> | null = null;

  // Exact lookup, not a wildcard search — the Identity API is keyed by the (type, externalId)
  // pair, so both fields are required and there's at most one result (§findByExternalId).
  externalIdType = '';
  externalIdValue = '';
  externalIdSearching = false;
  readonly externalIdResults = signal<IManagedObject[]>([]);

  loadingMore = false;

  /**
   * `computed()`, not a plain getter — `[rows]`/`[pagination]` are bound straight off this and
   * `gridPagination` below. A getter re-evaluated on every change-detection pass returns a *new*
   * array/objects each time even when nothing changed, which `c8y-data-grid` reads as "the data
   * changed" and re-renders/reloads — visible as constant flicker. `computed()` only recomputes
   * (and only produces a new reference) when one of the signals it reads actually changes.
   *
   * Results are deliberately NOT filtered to devices/groups (unlike the tree): an explicit search
   * must surface whatever matched, e.g. custom-typed objects like `ec_PlantConfiguration` that
   * carry neither `c8y_IsDevice` nor `c8y_IsDeviceGroup`.
   */
  readonly mergedResults = computed(() => {
    const sources: MatchSource[] = [
      { reason: 'name/id/type', items: this.results() },
      { reason: 'fragment', items: this.fragmentResults() },
      { reason: 'external id', items: this.externalIdResults() },
    ];
    return mergeSearchResults(sources);
  });

  /**
   * `c8y-data-grid` paginates its client-side `rows` locally (`pagination.pageSize`/`currentPage`)
   * and, since we hide its own footer (our own "Load more" button drives fetching more, not the
   * grid), there'd be no way to reach a "next page" of the grid's own if the default page size
   * ever truncated `mergedResults`. Keeping `pageSize` pinned to the current result count makes
   * the grid always render the full accumulated list, i.e. effectively disables its own paging.
   */
  readonly gridPagination = computed<Pagination>(() => ({ pageSize: Math.max(this.mergedResults().length, 1), currentPage: 1 }));

  get anySearchActive(): boolean {
    return !!this.searchTerm.trim() || !!this.fragmentTerm.trim() || (!!this.externalIdType.trim() && !!this.externalIdValue.trim());
  }

  get anySearchInFlight(): boolean {
    return this.searching || this.fragmentSearching || this.externalIdSearching;
  }

  get hasMore(): boolean {
    return hasNextPage(this.resultsPage) || hasNextPage(this.fragmentResultsPage);
  }

  constructor() {
    // "Start new" (the Refresh action-bar button) should clear both searches too.
    effect(() => {
      this.nav.refreshRequested();
      if (this.firstRefreshSignal) {
        this.firstRefreshSignal = false;
        return;
      }
      this.clearSearches();
    });
  }

  private clearSearches(): void {
    this.setCollapsed(false);
    this.searchTerm = '';
    this.results.set([]);
    this.resultsPage = null;
    this.fragmentTerm = '';
    this.fragmentResults.set([]);
    this.fragmentResultsPage = null;
    this.externalIdType = '';
    this.externalIdValue = '';
    this.externalIdResults.set([]);
  }

  onSearchInput(): void {
    this.setCollapsed(false);
    clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => void this.runSearch(), InventorySearchComponent.SEARCH_DEBOUNCE_MS);
  }

  onFragmentInput(): void {
    this.setCollapsed(false);
    clearTimeout(this.fragmentDebounce);
    this.fragmentDebounce = setTimeout(() => void this.runFragmentSearch(), InventorySearchComponent.SEARCH_DEBOUNCE_MS);
  }

  onExternalIdInput(): void {
    this.setCollapsed(false);
    clearTimeout(this.externalIdDebounce);
    this.externalIdDebounce = setTimeout(() => void this.runExternalIdSearch(), InventorySearchComponent.SEARCH_DEBOUNCE_MS);
  }

  onRowClick(row: SearchResultRow): void {
    this.select(row.object.id);
  }

  select(id: string): void {
    this.setCollapsed(true);
    void this.nav.open(id);
  }

  expand(): void {
    this.setCollapsed(false);
  }

  private setCollapsed(value: boolean): void {
    this.collapsed.set(value);
    this.collapsedChange.emit(value);
  }

  cellIcon(context: CellRendererContext): string {
    const row = context.item as SearchResultRow;
    return managedObjectIcon(row.object);
  }

  cellName(context: CellRendererContext): string {
    const row = context.item as SearchResultRow;
    return row.object['name'] || row.object.id;
  }

  /** Advances whichever underlying query (or both) still has another page, and appends the new items. */
  async loadMore(): Promise<void> {
    if (this.loadingMore || !this.hasMore) {
      return;
    }
    this.loadingMore = true;
    try {
      const [nextResults, nextFragmentResults] = await Promise.all([
        hasNextPage(this.resultsPage) ? this.resultsPage!.paging!.next() : null,
        hasNextPage(this.fragmentResultsPage) ? this.fragmentResultsPage!.paging!.next() : null,
      ]);
      if (nextResults) {
        this.resultsPage = nextResults;
        this.results.update((current) => [...current, ...nextResults.data]);
      }
      if (nextFragmentResults) {
        this.fragmentResultsPage = nextFragmentResults;
        this.fragmentResults.update((current) => [...current, ...nextFragmentResults.data]);
      }
    } finally {
      this.loadingMore = false;
    }
  }

  private async runSearch(): Promise<void> {
    const term = this.searchTerm.trim();
    if (!term) {
      this.results.set([]);
      this.resultsPage = null;
      return;
    }
    this.searching = true;
    try {
      const page = await this.nav.search(term);
      this.resultsPage = page;
      this.results.set(page?.data ?? []);
    } finally {
      this.searching = false;
    }
  }

  private async runFragmentSearch(): Promise<void> {
    const term = this.fragmentTerm.trim();
    if (!term) {
      this.fragmentResults.set([]);
      this.fragmentResultsPage = null;
      return;
    }
    this.fragmentSearching = true;
    try {
      const page = await this.nav.searchByFragment(term);
      this.fragmentResultsPage = page;
      this.fragmentResults.set(page?.data ?? []);
    } finally {
      this.fragmentSearching = false;
    }
  }

  private async runExternalIdSearch(): Promise<void> {
    const type = this.externalIdType.trim();
    const value = this.externalIdValue.trim();
    if (!type || !value) {
      this.externalIdResults.set([]);
      return;
    }
    this.externalIdSearching = true;
    try {
      this.externalIdResults.set(await this.nav.findByExternalId(type, value));
    } finally {
      this.externalIdSearching = false;
    }
  }
}
