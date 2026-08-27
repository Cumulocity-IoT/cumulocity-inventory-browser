import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { InventoryTreeComponent } from './inventory-tree.component';
import { InventoryNavigationService } from '../state/inventory-navigation.service';

describe('InventoryTreeComponent — reacting to a refresh request', () => {
  it('collapses and reloads root nodes when refreshRequested changes', async () => {
    const refreshRequested = signal(0);
    let rootNodesCallCount = 0;
    const nav = {
      rootNodes: async () => {
        rootNodesCallCount++;
        return [];
      },
      refreshRequested,
      onlyDevicesAndGroups: signal(true),
    };

    TestBed.configureTestingModule({
      imports: [InventoryTreeComponent],
      providers: [{ provide: InventoryNavigationService, useValue: nav }],
    });
    const fixture = TestBed.createComponent(InventoryTreeComponent);
    fixture.detectChanges();
    await Promise.resolve();
    expect(rootNodesCallCount).toBe(1);

    refreshRequested.set(1);
    fixture.detectChanges();
    await Promise.resolve();

    expect(rootNodesCallCount).toBe(2);
  });
});
