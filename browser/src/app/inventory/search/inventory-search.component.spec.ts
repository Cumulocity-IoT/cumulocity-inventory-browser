import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { InventorySearchComponent } from './inventory-search.component';
import { InventoryNavigationService } from '../state/inventory-navigation.service';

// `c8y-data-grid` pulls in a heavy DI tree (UserService, DataGridService, …) not worth mocking for
// these tests, so components here are never rendered via `fixture.detectChanges()` — only the
// constructor runs (real child components are only instantiated during template rendering).
// `TestBed.flushEffects()` still flushes the constructor's refresh `effect()` without rendering.

function createComponent(nav: any = { refreshRequested: () => 0 }) {
  TestBed.configureTestingModule({
    imports: [InventorySearchComponent],
    providers: [{ provide: InventoryNavigationService, useValue: nav }],
  });
  return TestBed.createComponent(InventorySearchComponent).componentInstance;
}

describe('InventorySearchComponent — devices/groups filter (always on)', () => {
  it('hides non-device/group results', () => {
    const device = { id: 'device-1', name: 'Device 1', c8y_IsDevice: {} } as any;
    const plainAsset = { id: 'plain-1', name: 'Plain asset' } as any;

    const component = createComponent();
    component.searchTerm = 'x';
    component.results.set([device, plainAsset]);

    expect(component.mergedResults().map((r) => r.object.id)).toEqual(['device-1']);
  });
});

describe('InventorySearchComponent — merged results from both fields', () => {
  it('merges a hit found by both searches into a single row tagged with both reasons', () => {
    const device = { id: 'device-1', name: 'Device 1', c8y_IsDevice: {} } as any;
    const fragmentOnly = { id: 'plain-1', name: 'Plain asset', c8y_IsDevice: {} } as any;

    const component = createComponent();
    component.searchTerm = 'x';
    component.results.set([device]);
    component.fragmentTerm = 'ec_Geo';
    component.fragmentResults.set([device, fragmentOnly]);

    const rows = component.mergedResults();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.object.id === 'device-1')?.matchReasons).toEqual(['name/id/type', 'fragment']);
    expect(rows.find((r) => r.object.id === 'plain-1')?.matchReasons).toEqual(['fragment']);
  });

  it('returns the same array reference across reads when nothing changed (no grid flicker)', () => {
    const component = createComponent();
    component.results.set([{ id: 'a', c8y_IsDevice: {} } as any]);

    expect(component.mergedResults()).toBe(component.mergedResults());
    expect(component.gridPagination()).toBe(component.gridPagination());
  });
});

describe('InventorySearchComponent — load more', () => {
  // `nextPage` (not `totalPages`) is what our code checks — see shared/paging.util.ts for why.
  function fakePage(data: any[], currentPage: number, totalPages: number) {
    const nextPage = currentPage < totalPages ? currentPage + 1 : undefined;
    const page: any = { data, paging: { currentPage, nextPage } };
    page.paging.next = async () => fakePage([{ id: `p${currentPage + 1}-a` }], currentPage + 1, totalPages);
    return page;
  }

  it('reports hasMore only while either underlying query still has another page', async () => {
    const component = createComponent();
    component.searchTerm = 'x';
    (component as any).resultsPage = fakePage([{ id: 'a' }], 1, 2);
    (component as any).fragmentResultsPage = null;

    expect(component.hasMore).toBe(true);

    (component as any).resultsPage = fakePage([{ id: 'a' }], 2, 2);
    expect(component.hasMore).toBe(false);
  });

  it('loadMore() appends the next page to results and advances paging', async () => {
    const component = createComponent();
    component.searchTerm = 'x';
    component.results.set([{ id: 'a' } as any]);
    (component as any).resultsPage = fakePage([{ id: 'a' }], 1, 2);

    await component.loadMore();

    expect(component.results().map((r) => r.id)).toEqual(['a', 'p2-a']);
    expect(component.hasMore).toBe(false);
    expect(component.loadingMore).toBe(false);
  });

  it('is a no-op when there is nothing more to load', async () => {
    const component = createComponent();
    component.results.set([{ id: 'a' } as any]);
    (component as any).resultsPage = null;

    await component.loadMore();

    expect(component.results()).toEqual([{ id: 'a' }]);
  });
});

describe('InventorySearchComponent — reacting to a refresh request', () => {
  // The refreshRequested→clear wiring is a one-line `effect()` in the constructor; flushing it for
  // real via TestBed.flushEffects() triggers a full ApplicationRef.tick(), which — since
  // TestBed.createComponent() auto-attaches views — renders the real `c8y-data-grid` and its heavy
  // DI tree (UserService, DataGridService, …), which this test module doesn't provide. Test the
  // extracted clearing logic directly instead; the effect wiring itself is a single trivial line.
  it('clears all three search boxes and their results', () => {
    const component = createComponent();
    component.searchTerm = 'leftover search';
    component.results.set([{ id: 'x' } as any]);
    component.fragmentTerm = 'ec_Geo';
    component.fragmentResults.set([{ id: 'y' } as any]);
    component.externalIdType = 'c8y_Serial';
    component.externalIdValue = '12345';
    component.externalIdResults.set([{ id: 'z' } as any]);

    (component as any).clearSearches();

    expect(component.searchTerm).toBe('');
    expect(component.results()).toEqual([]);
    expect(component.fragmentTerm).toBe('');
    expect(component.fragmentResults()).toEqual([]);
    expect(component.externalIdType).toBe('');
    expect(component.externalIdValue).toBe('');
    expect(component.externalIdResults()).toEqual([]);
  });
});

describe('InventorySearchComponent — external ID search', () => {
  it('requires both type and value before querying', async () => {
    let calls = 0;
    const component = createComponent({
      refreshRequested: () => 0,
      findByExternalId: async () => {
        calls++;
        return [];
      },
    });

    component.externalIdType = 'c8y_Serial';
    component.externalIdValue = '';
    expect(component.anySearchActive).toBe(false);
    await (component as any).runExternalIdSearch();
    expect(calls).toBe(0);
    expect(component.externalIdResults()).toEqual([]);
  });

  it('queries and surfaces the single result once both fields are filled', async () => {
    const found = { id: 'device-1', name: 'Device 1', c8y_IsDevice: {} } as any;
    let lastArgs: unknown;
    const component = createComponent({
      refreshRequested: () => 0,
      findByExternalId: async (type: string, value: string) => {
        lastArgs = [type, value];
        return [found];
      },
    });

    component.externalIdType = 'c8y_Serial';
    component.externalIdValue = '12345';
    expect(component.anySearchActive).toBe(true);
    await (component as any).runExternalIdSearch();

    expect(lastArgs).toEqual(['c8y_Serial', '12345']);
    expect(component.externalIdResults()).toEqual([found]);
    expect(component.mergedResults()[0].matchReasons).toEqual(['external id']);
  });
});
