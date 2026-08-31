import { ChangeDetectorRef, Component, NgZone, OnInit, effect, inject } from '@angular/core';
import { IManagedObject, IResultList } from '@c8y/client';
import { hasNextPage } from '../shared/paging.util';
import { sortByName } from '../shared/sort-managed-objects.util';
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
  private readonly ngZone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private firstRefreshSignal = true;

  rootGroups: IManagedObject[] = [];
  loadingMore = false;
  private rootGroupsPage: IResultList<IManagedObject> | null = null;
  private rootGroupsReady: Promise<void> = Promise.resolve();
  /**
   * Requests spent paging the root list purely to reveal *the current* selection
   * (§ensureRevealedRootLoaded) — a selection whose top-of-chain ancestor isn't itself a
   * `c8y_IsDeviceGroup` root (e.g. it's a plain device or asset with no group) will never show up
   * in `rootGroups` no matter how many pages are fetched, and `hasMore` alone doesn't catch that:
   * it only reports whether the *server* has more pages, not whether continuing to page is worth
   * it. Without this cap that case silently pages through the tenant's entire root-group list —
   * potentially hundreds of requests. Reset per distinct `revealIds()` value (i.e. per navigation,
   * keyed by `revealAttemptsKey`) rather than once for this component's whole lifetime — otherwise
   * attempts spent on an earlier, unreachable selection would keep eating into every later, actually
   * reachable one's budget.
   */
  private revealLoadMoreAttempts = 0;
  private revealAttemptsKey: string | null = null;
  private static readonly MAX_REVEAL_LOAD_MORE_ATTEMPTS = 15;

  get hasMore(): boolean {
    return hasNextPage(this.rootGroupsPage);
  }

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

    // Auto-expand to the current selection: page through the root list (the same "Load more" a
    // user would click) until the top-of-chain ancestor id from InventoryNavigationService.revealIds
    // shows up — InventoryTreeNodeComponent handles the rest (expanding down from there) once that
    // root node exists to attach to.
    //
    // Wrapped in ngZone.run(): this effect only reacts to revealIds()/currentObject(), never a real
    // DOM event, so nothing guarantees it flushes inside the Angular zone — forcing it back in here
    // ensures the rootGroups mutation actually gets picked up by a change detection tick.
    effect(() => {
      const ids = this.nav.revealIds();
      this.ngZone.run(() => void this.ensureRevealedRootLoaded(ids));
    });
  }

  ngOnInit(): void {
    this.rootGroupsReady = this.loadRootGroups();
  }

  async loadRootGroups(): Promise<void> {
    const page = await this.nav.rootGroups();
    this.rootGroupsPage = page;
    this.rootGroups = sortByName(page.data);
    this.cdr.markForCheck();
  }

  async loadMore(): Promise<void> {
    if (this.loadingMore || !this.hasMore) {
      return;
    }
    this.loadingMore = true;
    try {
      const page = await this.rootGroupsPage!.paging!.next();
      this.rootGroupsPage = page;
      this.rootGroups = sortByName([...this.rootGroups, ...page.data]);
    } finally {
      this.loadingMore = false;
      this.cdr.markForCheck();
    }
  }

  private async ensureRevealedRootLoaded(ids: ReadonlySet<string>): Promise<void> {
    if (!ids.size) {
      return;
    }
    const key = [...ids].sort().join(',');
    if (key !== this.revealAttemptsKey) {
      this.revealAttemptsKey = key;
      this.revealLoadMoreAttempts = 0;
    }
    await this.rootGroupsReady;
    while (
      this.hasMore &&
      this.revealLoadMoreAttempts < InventoryTreeComponent.MAX_REVEAL_LOAD_MORE_ATTEMPTS &&
      !this.rootGroups.some((group) => ids.has(group.id))
    ) {
      this.revealLoadMoreAttempts++;
      await this.loadMore();
    }
  }

  /**
   * Collapses the whole tree back to its root — clearing `rootGroups` before refetching tears down
   * every `InventoryTreeNodeComponent` (with its own expanded/loaded child state) rather than
   * reusing them, so previously-expanded groups collapse.
   */
  private async reloadFromScratch(): Promise<void> {
    this.rootGroups = [];
    this.rootGroupsPage = null;
    this.revealLoadMoreAttempts = 0;
    this.revealAttemptsKey = null;
    this.rootGroupsReady = this.loadRootGroups();
    await this.rootGroupsReady;
  }
}
