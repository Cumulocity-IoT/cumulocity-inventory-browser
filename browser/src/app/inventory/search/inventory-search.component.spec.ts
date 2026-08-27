import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { InventorySearchComponent } from './inventory-search.component';
import { InventoryNavigationService } from '../state/inventory-navigation.service';

describe('InventorySearchComponent — devices/groups filter', () => {
  const device = { id: 'device-1', name: 'Device 1', c8y_IsDevice: {} } as any;
  const plainAsset = { id: 'plain-1', name: 'Plain asset' } as any;

  function createFixture(onlyDevicesAndGroups: WritableSignal<boolean>) {
    TestBed.configureTestingModule({
      imports: [InventorySearchComponent],
      providers: [{ provide: InventoryNavigationService, useValue: { refreshRequested: () => 0, onlyDevicesAndGroups } }],
    });
    const fixture = TestBed.createComponent(InventorySearchComponent);
    fixture.componentInstance.searchTerm = 'x';
    fixture.componentInstance.results = [device, plainAsset];
    fixture.detectChanges();
    return fixture;
  }

  it('hides non-device/group results when the shared filter is on', () => {
    const fixture = createFixture(signal(true));
    expect(fixture.componentInstance.mergedResults.map((r) => r.object.id)).toEqual(['device-1']);
    expect(fixture.nativeElement.querySelectorAll('c8y-li').length).toBe(1);
  });

  it('shows every result when the shared filter is off', () => {
    const fixture = createFixture(signal(false));
    expect(fixture.componentInstance.mergedResults.map((r) => r.object.id)).toEqual(['device-1', 'plain-1']);
    expect(fixture.nativeElement.querySelectorAll('c8y-li').length).toBe(2);
  });
});

describe('InventorySearchComponent — merged results from both fields', () => {
  it('merges a hit found by both searches into a single row tagged with both reasons', () => {
    const device = { id: 'device-1', name: 'Device 1', c8y_IsDevice: {} } as any;
    const fragmentOnly = { id: 'plain-1', name: 'Plain asset', c8y_IsDevice: {} } as any;

    TestBed.configureTestingModule({
      imports: [InventorySearchComponent],
      providers: [
        { provide: InventoryNavigationService, useValue: { refreshRequested: () => 0, onlyDevicesAndGroups: signal(true) } },
      ],
    });
    const fixture = TestBed.createComponent(InventorySearchComponent);
    fixture.componentInstance.searchTerm = 'x';
    fixture.componentInstance.results = [device];
    fixture.componentInstance.fragmentTerm = 'ec_Geo';
    fixture.componentInstance.fragmentResults = [device, fragmentOnly];
    fixture.detectChanges();

    const rows = fixture.componentInstance.mergedResults;
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.object.id === 'device-1')?.matchReasons).toEqual(['name/id/type', 'fragment']);
    expect(rows.find((r) => r.object.id === 'plain-1')?.matchReasons).toEqual(['fragment']);
    expect(fixture.nativeElement.querySelectorAll('c8y-li').length).toBe(2);
  });
});

describe('InventorySearchComponent — reacting to a refresh request', () => {
  it('clears both search boxes and their results when refreshRequested changes', () => {
    const refreshRequested = signal(0);
    const nav = { refreshRequested, onlyDevicesAndGroups: signal(true) };

    TestBed.configureTestingModule({
      imports: [InventorySearchComponent],
      providers: [{ provide: InventoryNavigationService, useValue: nav }],
    });
    const fixture = TestBed.createComponent(InventorySearchComponent);
    fixture.componentInstance.searchTerm = 'leftover search';
    fixture.componentInstance.results = [{ id: 'x' } as any];
    fixture.componentInstance.fragmentTerm = 'ec_Geo';
    fixture.componentInstance.fragmentResults = [{ id: 'y' } as any];
    fixture.detectChanges();

    refreshRequested.set(1);
    fixture.detectChanges();

    expect(fixture.componentInstance.searchTerm).toBe('');
    expect(fixture.componentInstance.results).toEqual([]);
    expect(fixture.componentInstance.fragmentTerm).toBe('');
    expect(fixture.componentInstance.fragmentResults).toEqual([]);
  });
});
