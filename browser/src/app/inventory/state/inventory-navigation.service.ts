import { Injectable, computed, signal } from '@angular/core';
import { IManagedObject, IResultList, IdentityService, InventoryService } from '@c8y/client';
import { HistoryEntry, IdentityEntry, ReferenceNode, SiblingContext } from './inventory.model';
import { isDeviceOrGroup } from '../shared/managed-object-filter.util';
import { extractReferenceNode } from '../shared/reference-link.util';
import { sortByName } from '../shared/sort-managed-objects.util';

@Injectable({ providedIn: 'root' })
export class InventoryNavigationService {
  private readonly _currentObject = signal<IManagedObject | null>(null);
  private readonly _identities = signal<IdentityEntry[]>([]);
  private readonly _history = signal<HistoryEntry[]>([]);
  private readonly _siblingContext = signal<SiblingContext | null>(null);
  private readonly _loading = signal(false);
  /** Bumped by refresh() — InventoryTreeComponent (mounted separately, in the Navigator) reacts to it. */
  private readonly _refreshRequested = signal(0);
  /**
   * The currently-open object's id plus every ancestor id resolved so far, up to its true root —
   * used by InventoryTreeComponent/InventoryTreeNodeComponent to auto-expand the Navigator tree
   * down to whatever's selected. Built incrementally by `computeRevealIds` (§load), not a pure
   * `computed()` off `currentObject` — see that method for why.
   */
  private readonly _revealIds = signal<ReadonlySet<string>>(new Set());
  private revealToken = 0;

  readonly currentObject = this._currentObject.asReadonly();
  readonly identities = this._identities.asReadonly();
  readonly siblingContext = this._siblingContext.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly refreshRequested = this._refreshRequested.asReadonly();
  readonly revealIds = this._revealIds.asReadonly();

  readonly canGoBack = computed(() => this._history().length > 0);
  readonly canGoParent = computed(() => this.parentTargetId() !== null);
  readonly canGoPrev = computed(() => {
    const ctx = this._siblingContext();
    return !!ctx && ctx.index > 0;
  });
  readonly canGoNext = computed(() => {
    const ctx = this._siblingContext();
    return !!ctx && ctx.index < ctx.referenceArray.length - 1;
  });

  constructor(
    private inventory: InventoryService,
    private identity: IdentityService
  ) {}

  /** Clears the currently open object, identities, history, and sibling context. */
  reset(): void {
    this._currentObject.set(null);
    this._identities.set([]);
    this._history.set([]);
    this._siblingContext.set(null);
    this._revealIds.set(new Set());
    this.revealToken++; // invalidates any in-flight computeRevealIds() walk
  }

  /** "Start new": resets navigation state and signals InventoryTreeComponent to reload/collapse. */
  refresh(): void {
    this.reset();
    this._refreshRequested.update((v) => v + 1);
  }

  async open(id: string, siblingContext?: SiblingContext): Promise<void> {
    this.pushHistory();
    await this.load(id, siblingContext ?? null);
  }

  async back(): Promise<void> {
    const stack = this._history();
    if (!stack.length) {
      return;
    }
    const entry = stack[stack.length - 1];
    this._history.set(stack.slice(0, -1));
    await this.load(entry.id, entry.siblingContext ?? null);
  }

  async parent(): Promise<void> {
    const id = this.parentTargetId();
    if (!id) {
      return;
    }
    await this.open(id);
  }

  async prev(): Promise<void> {
    const ctx = this._siblingContext();
    if (!ctx || ctx.index <= 0) {
      return;
    }
    const index = ctx.index - 1;
    await this.open(ctx.referenceArray[index].id, { referenceArray: ctx.referenceArray, index, originId: ctx.originId });
  }

  async next(): Promise<void> {
    const ctx = this._siblingContext();
    if (!ctx || ctx.index >= ctx.referenceArray.length - 1) {
      return;
    }
    const index = ctx.index + 1;
    await this.open(ctx.referenceArray[index].id, { referenceArray: ctx.referenceArray, index, originId: ctx.originId });
  }

  /**
   * List-type responses (search results, tree nodes) only ever render `name`/`id` and the
   * `c8y_IsDevice`/`c8y_IsDeviceGroup` fragments used by the devices/groups filter — never the
   * nested child stubs Cumulocity would otherwise attach to every item. `withChildren: false`
   * (per the Inventory API's "Retrieve all managed objects" docs) keeps those responses lean.
   * `withParents: true` is requested by default so every list item also carries its device/asset
   * parent references.
   */
  private static readonly LIST_FILTER = { withChildren: false, withParents: true };

  /**
   * Returns the full `IResultList` (not just `.data`) so callers can page further via
   * `result.paging.next()` — used to drive InventorySearchComponent's "Load more" button.
   */
  async search(text: string): Promise<IResultList<IManagedObject> | null> {
    const term = text.trim();
    if (!term) {
      return null;
    }
    // Query-language `name eq '*term*' or id eq 'term' or type eq '*term*'` (wildcards supported
    // per the Inventory API's query language docs) restricts matching to the name/id/type fields
    // only, instead of `text`'s full-text search across the whole managed object.
    return this.inventory.listQuery(
      { __or: [{ name: `*${term}*` }, { id: term }, { type: `*${term}*` }] },
      { pageSize: InventoryNavigationService.SEARCH_PAGE_SIZE, ...InventoryNavigationService.LIST_FILTER }
    );
  }

  /**
   * Matches objects that *have* the given top-level fragment defined (`__has`, per the Inventory
   * API's query language) — e.g. `c8y_Position`, `c8y_Position`. Kept as its own query rather than
   * OR'd/AND'd into `search()`: existence-of-a-fragment and contains-this-text are different kinds
   * of match, and combining them would either return an unrelated mishmash (OR) or silently make
   * the name/id/type search stricter whenever this field has a value (AND).
   * Also returns the full `IResultList` for the same "Load more" reason as `search()`.
   */
  async searchByFragment(fragmentName: string): Promise<IResultList<IManagedObject> | null> {
    const name = fragmentName.trim();
    if (!name) {
      return null;
    }
    return this.inventory.listQuery(
      { __has: name },
      { pageSize: InventoryNavigationService.SEARCH_PAGE_SIZE, ...InventoryNavigationService.LIST_FILTER }
    );
  }

  private static readonly SEARCH_PAGE_SIZE = 20;

  /**
   * Exact lookup via the Identity API's `GET /identity/externalIds/{type}/{externalId}`
   * (`IdentityService.detail`) — unlike `search()`/`searchByFragment()`, external IDs aren't a
   * free-text/wildcard match: the API is keyed by the exact (type, externalId) pair, so both are
   * required and there's at most one result. That response only carries the matched
   * `managedObject`'s `id`/`self` (no `name`), so a second, lightweight `detail()` fetch resolves
   * the name for display — only ever one extra request, since there's at most one hit.
   */
  async findByExternalId(type: string, externalId: string): Promise<IManagedObject[]> {
    if (!type.trim() || !externalId.trim()) {
      return [];
    }
    try {
      const { data } = await this.identity.detail({ type: type.trim(), externalId: externalId.trim() });
      const id = data.managedObject?.id;
      if (!id) {
        return [];
      }
      const { data: managedObject } = await this.inventory.detail(id, { withChildren: false });
      return [managedObject];
    } catch {
      return [];
    }
  }

  /**
   * Top-level tree entries: only *root* device groups (`fragmentType: c8y_IsDeviceGroup`,
   * `onlyRoots: true` — the Inventory API's own way of excluding groups that have a parent, per
   * https://cumulocity.com/api/core/#operation/getManagedObjectCollectionResource) — matches how
   * Device Management's own Groups navigator scopes its root list (mirrored from
   * `@c8y/ngx-components/assets-navigator`'s `AssetNodeService`, which isn't a dependency here).
   * That same navigator also caps the page at a fixed size and appends a "Load more" affordance
   * instead of fetching every group tenant-wide in one request — `PAGE_SIZE = 20` there, matched
   * here — so InventoryTreeComponent holds onto the returned `IResultList` to page further via
   * `.paging.next()`, the same "Load more" pattern already used for search.
   */
  async rootGroups(): Promise<IResultList<IManagedObject>> {
    return this.inventory.list({
      fragmentType: 'c8y_IsDeviceGroup',
      onlyRoots: true,
      pageSize: InventoryNavigationService.ROOT_GROUPS_PAGE_SIZE,
      ...InventoryNavigationService.LIST_FILTER,
    });
  }

  private static readonly ROOT_GROUPS_PAGE_SIZE = 20;

  async childrenOf(id: string): Promise<IManagedObject[]> {
    const [assets, devices] = await Promise.all([
      this.inventory.childAssetsList(id, { pageSize: 100, ...InventoryNavigationService.LIST_FILTER }),
      this.inventory.childDevicesList(id, { pageSize: 100, ...InventoryNavigationService.LIST_FILTER }),
    ]);
    // childAssets can include plain (non-device, non-group) assets — childDevices is always
    // devices, but filtering both keeps this in line with search results (§isDeviceOrGroup).
    return sortByName([...assets.data, ...devices.data].filter(isDeviceOrGroup));
  }

  /**
   * Parent target: prefers the object the user actually descended from — the origin of the
   * references[] array a link was clicked from (§SiblingContext) — over the object's own
   * inventory-hierarchy `deviceParents`/`assetParents`. Those two usually agree, but not always:
   * an object reached via e.g. `childAdditions` (not `childDevices`/`childAssets`) can have empty
   * `deviceParents`/`assetParents` even though the user clearly came from somewhere. Falls back to
   * the inventory-hierarchy lookup only when there's no sibling context at all (tree/search entry).
   */
  private parentTargetId(): string | null {
    const originId = this._siblingContext()?.originId;
    if (originId) {
      return originId;
    }
    return this.parentReference()?.id ?? null;
  }

  private parentReference(): ReferenceNode | null {
    const obj = this._currentObject();
    return obj ? InventoryNavigationService.directParentOf(obj) : null;
  }

  /**
   * With `withParents: true` (§load), the first entry from `parentsOf` is assumed to be the
   * *closest* ancestor — Cumulocity doesn't document the ordering explicitly, but "closest first"
   * is the conventional shape for this kind of ancestor list, and it's what the Up/Parent button
   * has always assumed.
   */
  private static directParentOf(obj: IManagedObject): ReferenceNode | null {
    return InventoryNavigationService.parentsOf(obj)[0] ?? null;
  }

  /**
   * Resolves the full ancestor chain up to the true root — NOT a single `withParents: true`
   * response. Confirmed against a real tenant: `withParents` does *not* reliably return ancestors
   * all the way to the root in one shot (contrary to what the docs' "all ancestors from all levels
   * above" phrasing suggests) — a device's own response listed 3 ancestors, none of which were
   * themselves the root, and the actual root (found only by manually expanding the tree) was one
   * level further up. So this treats `withParents` as "however far it got" per hop, and re-queries
   * (again with `withParents: true`, so each hop can still cover more than one level) from every
   * new ancestor edge until no hop turns up anything new. Runs in the background (fired from
   * `load()`, not awaited there) and updates `_revealIds` after each round, so the tree can start
   * expanding toward whatever's been resolved so far while deeper levels are still being fetched.
   * `revealToken` guards against a slower, superseded walk (from a since-abandoned navigation)
   * overwriting the result of a newer one. `MAX_REVEAL_ROUNDS` bounds runaway walks (a malformed or
   * cyclic parent graph) — each round can itself fan out to several `detail()` calls, so this is a
   * cap on *rounds*, not total requests.
   */
  private async computeRevealIds(startId: string, startObject: IManagedObject): Promise<void> {
    const token = ++this.revealToken;
    const ids = new Set<string>([startId]);
    this._revealIds.set(new Set(ids));

    let frontier = InventoryNavigationService.parentsOf(startObject).filter((ref) => !ids.has(ref.id));
    let round = 0;
    while (frontier.length && round++ < InventoryNavigationService.MAX_REVEAL_ROUNDS) {
      for (const ref of frontier) {
        ids.add(ref.id);
      }
      if (token !== this.revealToken) {
        return;
      }
      this._revealIds.set(new Set(ids));

      const results = await Promise.all(
        frontier.map((ref) =>
          this.inventory.detail(ref.id, { withChildren: false, withParents: true }).catch(() => null)
        )
      );
      if (token !== this.revealToken) {
        return;
      }
      const nextFrontier: ReferenceNode[] = [];
      for (const result of results) {
        if (!result) {
          continue;
        }
        for (const ref of InventoryNavigationService.parentsOf(result.data)) {
          if (!ids.has(ref.id)) {
            nextFrontier.push(ref);
          }
        }
      }
      frontier = nextFrontier;
    }
  }

  private static readonly MAX_REVEAL_ROUNDS = 10;

  private static parentsOf(obj: IManagedObject): ReferenceNode[] {
    const refs = [...(obj.deviceParents?.references ?? []), ...(obj.assetParents?.references ?? [])];
    return refs.map((ref) => extractReferenceNode(ref)).filter((ref): ref is ReferenceNode => ref !== null);
  }

  private pushHistory(): void {
    const previous = this._currentObject();
    if (!previous) {
      return;
    }
    const entry: HistoryEntry = { id: previous.id, siblingContext: this._siblingContext() ?? undefined };
    this._history.update((stack) => [...stack, entry]);
  }

  private async load(id: string, siblingContext: SiblingContext | null): Promise<void> {
    this._loading.set(true);
    try {
      const [detail, identities] = await Promise.all([
        // withChildren: true is explicit (rather than relying on the API's default) because our
        // reference-link navigation, Prev/Next sibling stepping, and Parent button all read the
        // childDevices/childAssets/childAdditions/deviceParents/assetParents arrays off this
        // response — a tenant with the `core.inventory.without.children` toggle enabled would
        // otherwise silently return them empty and break all of that.
        //
        // withParents: true turned out to be equally required for deviceParents/assetParents to
        // come back populated at all — the single-object GET does NOT include ancestor references
        // by default (confirmed against a real tenant: without this flag, a non-root group's own
        // deviceParents/assetParents both came back as empty arrays even though it clearly has
        // real parents). This had been silently masked wherever Up/Parent used the sibling-context
        // `originId` fallback (§parentTargetId) instead — any array-descent navigation always set
        // that, so the broken deviceParents/assetParents fallback path was rarely exercised. Per
        // the docs, this returns "all ancestors from all levels above" — in practice (confirmed
        // against a real tenant) it doesn't reliably reach the true root in one shot, so revealIds
        // (§computeRevealIds) keeps walking further from whatever this response did return.
        this.inventory.detail(id, { withChildren: true, withParents: true }),
        this.identity.list(id).catch(() => ({ data: [] as IdentityEntry[] })),
      ]);
      this._currentObject.set(detail.data);
      this._identities.set((identities.data ?? []) as IdentityEntry[]);
      this._siblingContext.set(siblingContext);
      void this.computeRevealIds(id, detail.data);
    } finally {
      this._loading.set(false);
    }
  }
}
