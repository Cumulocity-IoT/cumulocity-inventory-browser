import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { InventoryTreeNodeComponent } from './inventory-tree-node.component';
import { InventoryNavigationService } from '../state/inventory-navigation.service';

function createFixture(nav: any) {
  TestBed.configureTestingModule({
    imports: [InventoryTreeNodeComponent],
    providers: [{ provide: InventoryNavigationService, useValue: nav }],
  });
  const fixture = TestBed.createComponent(InventoryTreeNodeComponent);
  fixture.componentRef.setInput('node', { id: 'group-1', name: 'Group 1' });
  return fixture;
}

describe('InventoryTreeNodeComponent — reveal-in-tree auto-expand', () => {
  it('expands and fetches children when its id is in revealIds()', async () => {
    let childrenFetched = 0;
    const nav = {
      currentObject: () => null,
      revealIds: signal(new Set(['group-1'])),
      childrenOf: async () => {
        childrenFetched++;
        return [];
      },
    };

    const fixture = createFixture(nav);
    fixture.detectChanges();
    await Promise.resolve();

    expect(fixture.componentInstance.expanded).toBe(true);
    expect(childrenFetched).toBe(1);
  });

  it('does not expand when its id is not in revealIds()', async () => {
    const nav = {
      currentObject: () => null,
      revealIds: signal(new Set(['some-other-id'])),
      childrenOf: async () => [],
    };

    const fixture = createFixture(nav);
    fixture.detectChanges();
    await Promise.resolve();

    expect(fixture.componentInstance.expanded).toBe(false);
  });

  it('does not auto-expand the selected object itself, only its ancestors', async () => {
    let childrenFetched = 0;
    const nav = {
      currentObject: () => ({ id: 'group-1' }),
      revealIds: signal(new Set(['group-1'])),
      childrenOf: async () => {
        childrenFetched++;
        return [];
      },
    };

    const fixture = createFixture(nav);
    fixture.detectChanges();
    await Promise.resolve();

    expect(fixture.componentInstance.expanded).toBe(false);
    expect(childrenFetched).toBe(0);
  });
});
