import { beforeEach, describe, expect, it } from 'vitest';
import { InventoryNavigationService } from './inventory-navigation.service';

function managedObject(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    self: `https://x/inventory/managedObjects/${id}`,
    name: `Object ${id}`,
    creationTime: '2026-01-01T00:00:00.000Z',
    lastUpdated: '2026-01-01T00:00:00.000Z',
    owner: 'tester',
    additionParents: { references: [] },
    assetParents: { references: [] },
    childAdditions: { references: [] },
    childAssets: { references: [] },
    childDevices: { references: [] },
    deviceParents: { references: [] },
    ...overrides,
  };
}

class FakeInventoryService {
  objects = new Map<string, ReturnType<typeof managedObject>>();
  lastQuery: unknown;
  lastListFilter: unknown;
  listResult: unknown[] = [];
  childAssets: unknown[] = [];
  childDevices: unknown[] = [];

  async detail(id: string) {
    const data = this.objects.get(id);
    if (!data) {
      throw new Error(`no object ${id}`);
    }
    return { data };
  }

  async list(filter: unknown) {
    this.lastListFilter = filter;
    return { data: this.listResult };
  }

  async listQuery(query: unknown) {
    this.lastQuery = query;
    return { data: [] };
  }

  async childAssetsList() {
    return { data: this.childAssets };
  }

  async childDevicesList() {
    return { data: this.childDevices };
  }
}

class FakeIdentityService {
  externalIdentity: { managedObject?: { id: string } } | null = null;
  detailError: Error | null = null;
  lastDetailArgs: unknown;

  async list() {
    return { data: [] };
  }

  async detail(identity: unknown) {
    this.lastDetailArgs = identity;
    if (this.detailError) {
      throw this.detailError;
    }
    if (!this.externalIdentity) {
      throw new Error('404');
    }
    return { data: this.externalIdentity };
  }
}

describe('InventoryNavigationService', () => {
  let inventory: FakeInventoryService;
  let identity: FakeIdentityService;
  let service: InventoryNavigationService;

  beforeEach(() => {
    inventory = new FakeInventoryService();
    inventory.objects.set('root', managedObject('root'));
    inventory.objects.set(
      'device-1',
      managedObject('device-1', { deviceParents: { references: [{ self: 'x', managedObject: { id: 'root' } }] } })
    );
    inventory.objects.set('device-2', managedObject('device-2'));
    identity = new FakeIdentityService();
    service = new InventoryNavigationService(inventory as any, identity as any);
  });

  it('has no back/parent/prev/next available before anything is opened', () => {
    expect(service.canGoBack()).toBe(false);
    expect(service.canGoParent()).toBe(false);
    expect(service.canGoPrev()).toBe(false);
    expect(service.canGoNext()).toBe(false);
  });

  it('pushes history on open() and back() restores the previous object', async () => {
    await service.open('root');
    await service.open('device-1');
    expect(service.currentObject()?.id).toBe('device-1');
    expect(service.canGoBack()).toBe(true);

    await service.back();
    expect(service.currentObject()?.id).toBe('root');
    expect(service.canGoBack()).toBe(false);
  });

  it('parent() navigates via deviceParents references', async () => {
    await service.open('device-1');
    expect(service.canGoParent()).toBe(true);

    await service.parent();
    expect(service.currentObject()?.id).toBe('root');
  });

  it('prev()/next() step through the sibling reference array and respect bounds', async () => {
    const referenceArray = [
      { id: 'device-1', self: 'x' },
      { id: 'device-2', self: 'y' },
      { id: 'root', self: 'z' },
    ];

    await service.open('device-2', { referenceArray, index: 1, originId: 'root' });
    expect(service.canGoPrev()).toBe(true);
    expect(service.canGoNext()).toBe(true);

    await service.next();
    expect(service.currentObject()?.id).toBe('root');
    expect(service.canGoNext()).toBe(false);

    await service.prev();
    expect(service.currentObject()?.id).toBe('device-2');

    await service.prev();
    expect(service.currentObject()?.id).toBe('device-1');
    expect(service.canGoPrev()).toBe(false);
  });

  it('parent() prefers the array-descent origin over deviceParents/assetParents when both are available', async () => {
    // device-1 actually has a deviceParents entry pointing at "root" (see beforeEach), but the
    // user reached it here via an array link clicked from "device-2" instead — Parent should
    // take them back to device-2, not silently jump to the unrelated inventory-hierarchy parent.
    const referenceArray = [{ id: 'device-1', self: 'x' }];
    await service.open('device-2');
    await service.open('device-1', { referenceArray, index: 0, originId: 'device-2' });
    expect(service.canGoParent()).toBe(true);

    await service.parent();
    expect(service.currentObject()?.id).toBe('device-2');
  });

  it('parent() falls back to deviceParents/assetParents when there is no array-descent origin', async () => {
    // Reached directly (tree/search), no sibling context at all — falls back as before.
    await service.open('device-1');
    expect(service.canGoParent()).toBe(true);

    await service.parent();
    expect(service.currentObject()?.id).toBe('root');
  });

  it('search() builds a name/id/type __or query', async () => {
    await service.search('c8y_Position');
    expect(inventory.lastQuery).toEqual({
      __or: [{ name: '*c8y_Position*' }, { id: 'c8y_Position' }, { type: '*c8y_Position*' }],
    });
  });

  it('search() short-circuits on blank input without querying', async () => {
    inventory.lastQuery = 'untouched';
    await service.search('   ');
    expect(inventory.lastQuery).toBe('untouched');
  });

  it('searchByFragment() builds a __has query, independent of search()', async () => {
    await service.searchByFragment('c8y_Position');
    expect(inventory.lastQuery).toEqual({ __has: 'c8y_Position' });
  });

  it('searchByFragment() short-circuits on blank input without querying', async () => {
    inventory.lastQuery = 'untouched';
    await service.searchByFragment('  ');
    expect(inventory.lastQuery).toBe('untouched');
  });

  it('rootGroups() queries only root device groups (fragmentType + onlyRoots)', async () => {
    await service.rootGroups();
    expect(inventory.lastListFilter).toMatchObject({ fragmentType: 'c8y_IsDeviceGroup', onlyRoots: true });
  });

  it('childrenOf() filters out plain assets and sorts devices/groups by name', async () => {
    inventory.childAssets = [
      { id: 'plain', name: 'Not a device or group' },
      { id: 'zebra-group', name: 'Zebra Group', c8y_IsDeviceGroup: {} },
    ];
    inventory.childDevices = [{ id: 'apple-device', name: 'Apple Device', c8y_IsDevice: {} }];

    const children = await service.childrenOf('root');

    expect(children.map((c) => c.id)).toEqual(['apple-device', 'zebra-group']);
  });

  it('findByExternalId() requires both type and value', async () => {
    expect(await service.findByExternalId('', 'x')).toEqual([]);
    expect(await service.findByExternalId('c8y_Serial', '')).toEqual([]);
    expect(identity.lastDetailArgs).toBeUndefined();
  });

  it('findByExternalId() looks up the exact (type, externalId) pair and resolves the managed object', async () => {
    identity.externalIdentity = { managedObject: { id: 'device-1' } };

    const result = await service.findByExternalId('c8y_Serial', '12345');

    expect(identity.lastDetailArgs).toEqual({ type: 'c8y_Serial', externalId: '12345' });
    expect(result.map((r) => r.id)).toEqual(['device-1']);
  });

  it('findByExternalId() returns an empty array when there is no match', async () => {
    identity.externalIdentity = null;
    expect(await service.findByExternalId('c8y_Serial', 'missing')).toEqual([]);
  });

  it('revealIds() keeps walking past a single withParents response until no hop turns up anything new', async () => {
    // leaf's own withParents response only lists 'device-1', not 'root' — a real tenant's response
    // for a non-root object was confirmed to stop partway too, contrary to what the docs' "all
    // ancestors from all levels above" phrasing suggests. device-1's own deviceParents -> 'root'
    // (already set up in beforeEach) is only found by continuing to walk from there.
    inventory.objects.set(
      'leaf',
      managedObject('leaf', { deviceParents: { references: [{ self: 'x', managedObject: { id: 'device-1' } }] } })
    );

    await service.open('leaf');
    // computeRevealIds() is fired-and-forgotten from load(), not awaited directly by open() — give
    // its background walk a chance to reach past device-1 to root.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(service.revealIds()).toEqual(new Set(['leaf', 'device-1', 'root']));
  });

  it('reset() clears revealIds()', async () => {
    await service.open('device-1');
    expect(service.revealIds().size).toBeGreaterThan(0);

    service.reset();

    expect(service.revealIds()).toEqual(new Set());
  });
});
