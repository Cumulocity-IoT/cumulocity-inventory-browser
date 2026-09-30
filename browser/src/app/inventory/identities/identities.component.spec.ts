import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { IdentitiesComponent } from './identities.component';
import { InventoryNavigationService } from '../state/inventory-navigation.service';

describe('IdentitiesComponent', () => {
  it('renders one chip per identity and copies the external id on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const identities = signal([
      { type: 'c8y_Serial', externalId: '1400015' },
      { type: 'ec_Serial', externalId: 'A-1' },
    ]);
    TestBed.configureTestingModule({
      providers: [{ provide: InventoryNavigationService, useValue: { identities } }],
    });
    const fixture = TestBed.createComponent(IdentitiesComponent);
    fixture.detectChanges();

    const chips = fixture.nativeElement.querySelectorAll('.chip');
    expect(chips.length).toBe(2);
    chips[0].click();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();

    expect(writeText).toHaveBeenCalledWith('1400015');
    expect(fixture.nativeElement.querySelector('.chip.copied')).toBeTruthy();
  });

  it('puts identities beyond the first two behind a "+N more" popover', () => {
    const identities = signal([
      { type: 'a', externalId: '1' },
      { type: 'b', externalId: '2' },
      { type: 'c', externalId: '3' },
      { type: 'd', externalId: '4' },
    ]);
    TestBed.configureTestingModule({
      providers: [{ provide: InventoryNavigationService, useValue: { identities } }],
    });
    const fixture = TestBed.createComponent(IdentitiesComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelectorAll('.chip:not(.more)').length).toBe(2);
    const more = el.querySelector<HTMLElement>('.chip.more')!;
    expect(more.textContent).toContain('+2 more');
    expect(el.querySelector('.popover')).toBeNull();

    more.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.popover .chip').length).toBe(2);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(el.querySelector('.popover')).toBeNull();
  });
});
