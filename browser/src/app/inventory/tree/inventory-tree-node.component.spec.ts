import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { InventoryTreeNodeComponent } from './inventory-tree-node.component';
import { InventoryNavigationService } from '../state/inventory-navigation.service';

describe('InventoryTreeNodeComponent — reveal-driven auto-expand', () => {
  it('auto-expands once its id appears in revealIds(), with no manual detectChanges() after the signal changes', async () => {
    const revealIds = signal<ReadonlySet<string>>(new Set());
    const currentObject = signal<any>(null);
    const nav = {
      revealIds,
      currentObject,
      childrenOf: async () => [{ id: 'child-1', name: 'Child 1' } as any],
    };

    TestBed.configureTestingModule({
      imports: [InventoryTreeNodeComponent],
      providers: [{ provide: InventoryNavigationService, useValue: nav }],
    });

    const fixture = TestBed.createComponent(InventoryTreeNodeComponent);
    fixture.componentRef.setInput('node', { id: 'root-1', name: 'Root 1' });
    // autoDetectChanges (not a one-off detectChanges()) hooks into NgZone's onMicrotaskEmpty, the
    // same automatic-re-render-after-async-work mechanism a real running app relies on — a bare
    // fixture.detectChanges() call only checks once, on demand, which isn't a faithful stand-in for
    // "the user is just looking at the running app after something resolved in the background".
    fixture.autoDetectChanges(true);

    expect(fixture.componentInstance.expanded).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('▸');

    // Simulates InventoryNavigationService.load() resolving and revealIds() (a computed reacting
    // to currentObject()) picking up this node's id as an ancestor — exactly the real trigger path,
    // no test-only hooks.
    revealIds.set(new Set(['root-1']));

    // Deliberately no fixture.detectChanges() / TestBed.flushEffects() here — a real user isn't
    // calling into Angular internals either. This waits for whatever the app's own effect
    // scheduling + zone + change detection naturally does on its own, exactly like a real browser.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(fixture.componentInstance.expanded).toBe(true);
    expect(fixture.componentInstance.children.map((c) => c.id)).toEqual(['child-1']);
    expect(fixture.nativeElement.textContent).toContain('▾');
    expect(fixture.nativeElement.textContent).toContain('Child 1');
  });
});
