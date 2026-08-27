import { Injectable, computed, signal } from '@angular/core';
import { IManagedObject, IdentityService, InventoryService } from '@c8y/client';
import { HistoryEntry, IdentityEntry, ReferenceNode, SiblingContext } from './inventory.model';
import { extractReferenceNode } from '../shared/reference-link.util';

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
   * Shared with InventoryTreeComponent (Navigator sidebar) and InventorySearchComponent (main
   * content, above the JSON view) — two separately-mounted components that both need to read/set
   * the same "only devices & groups" filter state.
   */
  private readonly _onlyDevicesAndGroups = signal(true);

  readonly currentObject = this._currentObject.asReadonly();
  readonly identities = this._identities.asReadonly();
  readonly siblingContext = this._siblingContext.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly refreshRequested = this._refreshRequested.asReadonly();
  readonly onlyDevicesAndGroups = this._onlyDevicesAndGroups.asReadonly();

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
  }

  /** "Start new": resets navigation state and signals InventoryTreeComponent to reload/collapse. */
  refresh(): void {
    this.reset();
    this._refreshRequested.update((v) => v + 1);
  }

  setOnlyDevicesAndGroups(value: boolean): void {
    this._onlyDevicesAndGroups.set(value);
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

  async search(text: string): Promise<IManagedObject[]> {
    const term = text.trim();
    if (!term) {
      return [];
    }
    // Query-language `name eq '*term*' or id eq 'term' or type eq '*term*'` (wildcards supported
    // per the Inventory API's query language docs) restricts matching to the name/id/type fields
    // only, instead of `text`'s full-text search across the whole managed object.
    const { data } = await this.inventory.listQuery(
      { __or: [{ name: `*${term}*` }, { id: term }, { type: `*${term}*` }] },
      { pageSize: 20, ...InventoryNavigationService.LIST_FILTER }
    );
    return data;
  }

  /**
   * Matches objects that *have* the given top-level fragment defined (`__has`, per the Inventory
   * API's query language) — e.g. `ec_Geo`, `c8y_Position`. Kept as its own query rather than
   * OR'd/AND'd into `search()`: existence-of-a-fragment and contains-this-text are different kinds
   * of match, and combining them would either return an unrelated mishmash (OR) or silently make
   * the name/id/type search stricter whenever this field has a value (AND).
   */
  async searchByFragment(fragmentName: string): Promise<IManagedObject[]> {
    const name = fragmentName.trim();
    if (!name) {
      return [];
    }
    const { data } = await this.inventory.listQuery(
      { __has: name },
      { pageSize: 20, ...InventoryNavigationService.LIST_FILTER }
    );
    return data;
  }

  /**
   * Top-level tree entries: tenant-wide groups AND devices (not just groups) — otherwise a
   * standalone device with no group parent would never be reachable by browsing the tree at all,
   * only via search.
   */
  async rootNodes(): Promise<IManagedObject[]> {
    const [groups, devices] = await Promise.all([
      this.inventory.list({ fragmentType: 'c8y_IsDeviceGroup', pageSize: 100, ...InventoryNavigationService.LIST_FILTER }),
      this.inventory.list({ fragmentType: 'c8y_IsDevice', pageSize: 100, ...InventoryNavigationService.LIST_FILTER }),
    ]);
    return [...groups.data, ...devices.data];
  }

  async childrenOf(id: string): Promise<IManagedObject[]> {
    const [assets, devices] = await Promise.all([
      this.inventory.childAssetsList(id, { pageSize: 100, ...InventoryNavigationService.LIST_FILTER }),
      this.inventory.childDevicesList(id, { pageSize: 100, ...InventoryNavigationService.LIST_FILTER }),
    ]);
    return [...assets.data, ...devices.data];
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
    if (!obj) {
      return null;
    }
    const deviceParent = obj.deviceParents?.references?.[0];
    const assetParent = obj.assetParents?.references?.[0];
    return extractReferenceNode(deviceParent) ?? extractReferenceNode(assetParent);
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
        this.inventory.detail(id, { withChildren: true }),
        this.identity.list(id).catch(() => ({ data: [] as IdentityEntry[] })),
      ]);
      this._currentObject.set(detail.data);
      this._identities.set((identities.data ?? []) as IdentityEntry[]);
      this._siblingContext.set(siblingContext);
    } finally {
      this._loading.set(false);
    }
  }
}
