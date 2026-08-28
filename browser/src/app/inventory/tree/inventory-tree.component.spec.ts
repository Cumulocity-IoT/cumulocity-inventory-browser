import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { InventoryTreeComponent } from './inventory-tree.component';
import { InventoryNavigationService } from '../state/inventory-navigation.service';

// `nextPage` (not `totalPages`) is what our code checks — see shared/paging.util.ts for why.
function page(data: any[], currentPage: number, totalPages: number) {
  const nextPage = currentPage < totalPages ? currentPage + 1 : undefined;
  const p: any = { data, paging: { currentPage, nextPage } };
  p.paging.next = async () => page([{ id: `p${currentPage + 1}-a`, name: `Group ${currentPage + 1}` }], currentPage + 1, totalPages);
  return p;
}

describe('InventoryTreeComponent — root groups', () => {
  it('sorts root groups alphabetically by name', async () => {
    const nav = {
      rootGroups: async () => page(
        [
          { id: '1', name: 'Zebra' },
          { id: '2', name: 'Apple' },
        ],
        1,
        1
      ),
      refreshRequested: () => 0,
      revealIds: () => new Set<string>(),
      currentObject: () => null,
    };

    TestBed.configureTestingModule({
      imports: [InventoryTreeComponent],
      providers: [{ provide: InventoryNavigationService, useValue: nav }],
    });
    const fixture = TestBed.createComponent(InventoryTreeComponent);
    fixture.detectChanges();
    await Promise.resolve();

    expect(fixture.componentInstance.rootGroups.map((g) => g.id)).toEqual(['2', '1']);
  });

  it('loadMore() appends the next page, keeping the accumulated list sorted', async () => {
    const nav = {
      rootGroups: async () => page([{ id: '1', name: 'Group 1' }], 1, 2),
      refreshRequested: () => 0,
      revealIds: () => new Set<string>(),
      currentObject: () => null,
    };

    TestBed.configureTestingModule({
      imports: [InventoryTreeComponent],
      providers: [{ provide: InventoryNavigationService, useValue: nav }],
    });
    const fixture = TestBed.createComponent(InventoryTreeComponent);
    fixture.detectChanges();
    await Promise.resolve();

    expect(fixture.componentInstance.hasMore).toBe(true);
    await fixture.componentInstance.loadMore();

    expect(fixture.componentInstance.rootGroups.map((g) => g.id)).toEqual(['1', 'p2-a']);
    expect(fixture.componentInstance.hasMore).toBe(false);
  });
});

describe('InventoryTreeComponent — reveal-in-tree paging', () => {
  it('pages through root groups (the same "Load more" a user would click) until the target ancestor id appears', async () => {
    const revealIds = signal(new Set<string>());
    const nav = {
      rootGroups: async () => page([{ id: 'a', name: 'A' }], 1, 3),
      refreshRequested: () => 0,
      revealIds,
      currentObject: () => null,
    };

    TestBed.configureTestingModule({
      imports: [InventoryTreeComponent],
      providers: [{ provide: InventoryNavigationService, useValue: nav }],
    });
    const fixture = TestBed.createComponent(InventoryTreeComponent);
    fixture.detectChanges();
    await Promise.resolve();
    expect(fixture.componentInstance.rootGroups.map((g) => g.id)).toEqual(['a']);

    // The `page()` fake's `.next()` always yields `p{page}-a` — target the id that lands on page 3.
    revealIds.set(new Set(['p3-a']));
    fixture.detectChanges();
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
    }

    expect(fixture.componentInstance.rootGroups.map((g) => g.id)).toEqual(['a', 'p2-a', 'p3-a']);
    expect(fixture.componentInstance.hasMore).toBe(false);
  });

  it('gives up after a bounded number of "Load more" attempts when the target never appears', async () => {
    // A selection whose top-of-chain ancestor isn't itself a root device group never shows up in
    // rootGroups no matter how many pages are fetched — with 1000 server-side pages available,
    // an unbounded loop here would fire hundreds of requests instead of stopping.
    const revealIds = signal(new Set<string>(['never-found']));
    const nav = {
      rootGroups: async () => page([{ id: 'a', name: 'A' }], 1, 1000),
      refreshRequested: () => 0,
      revealIds,
      currentObject: () => null,
    };

    TestBed.configureTestingModule({
      imports: [InventoryTreeComponent],
      providers: [{ provide: InventoryNavigationService, useValue: nav }],
    });
    const fixture = TestBed.createComponent(InventoryTreeComponent);
    fixture.detectChanges();
    for (let i = 0; i < 40; i++) {
      await Promise.resolve();
    }

    // 1 initial root-load page + 15 capped "Load more" attempts.
    expect(fixture.componentInstance.rootGroups).toHaveLength(16);
    // The server still has more (1000 pages) — the cap gave up, not the server running out.
    expect(fixture.componentInstance.hasMore).toBe(true);
  });
});

describe('InventoryTreeComponent — reacting to a refresh request', () => {
  it('collapses and reloads root groups when refreshRequested changes', async () => {
    const refreshRequested = signal(0);
    let rootGroupsCallCount = 0;
    const nav = {
      rootGroups: async () => {
        rootGroupsCallCount++;
        return page([], 1, 1);
      },
      refreshRequested,
      revealIds: () => new Set<string>(),
      currentObject: () => null,
    };

    TestBed.configureTestingModule({
      imports: [InventoryTreeComponent],
      providers: [{ provide: InventoryNavigationService, useValue: nav }],
    });
    const fixture = TestBed.createComponent(InventoryTreeComponent);
    fixture.detectChanges();
    await Promise.resolve();
    expect(rootGroupsCallCount).toBe(1);

    refreshRequested.set(1);
    fixture.detectChanges();
    await Promise.resolve();

    expect(rootGroupsCallCount).toBe(2);
  });
});
