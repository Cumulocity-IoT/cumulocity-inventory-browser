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

  async detail(id: string) {
    const data = this.objects.get(id);
    if (!data) {
      throw new Error(`no object ${id}`);
    }
    return { data };
  }

  async list() {
    return { data: [] };
  }

  async listQuery(query: unknown) {
    this.lastQuery = query;
    return { data: [] };
  }

  async childAssetsList() {
    return { data: [] };
  }

  async childDevicesList() {
    return { data: [] };
  }
}

class FakeIdentityService {
  async list() {
    return { data: [] };
  }
}

describe('InventoryNavigationService', () => {
  let inventory: FakeInventoryService;
  let service: InventoryNavigationService;

  beforeEach(() => {
    inventory = new FakeInventoryService();
    inventory.objects.set('root', managedObject('root'));
    inventory.objects.set(
      'device-1',
      managedObject('device-1', { deviceParents: { references: [{ self: 'x', managedObject: { id: 'root' } }] } })
    );
    inventory.objects.set('device-2', managedObject('device-2'));
    service = new InventoryNavigationService(inventory as any, new FakeIdentityService() as any);
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
    await service.search('ec_Geo');
    expect(inventory.lastQuery).toEqual({
      __or: [{ name: '*ec_Geo*' }, { id: 'ec_Geo' }, { type: '*ec_Geo*' }],
    });
  });

  it('search() short-circuits on blank input without querying', async () => {
    inventory.lastQuery = 'untouched';
    await service.search('   ');
    expect(inventory.lastQuery).toBe('untouched');
  });

  it('searchByFragment() builds a __has query, independent of search()', async () => {
    await service.searchByFragment('ec_Geo');
    expect(inventory.lastQuery).toEqual({ __has: 'ec_Geo' });
  });

  it('searchByFragment() short-circuits on blank input without querying', async () => {
    inventory.lastQuery = 'untouched';
    await service.searchByFragment('  ');
    expect(inventory.lastQuery).toBe('untouched');
  });
});
