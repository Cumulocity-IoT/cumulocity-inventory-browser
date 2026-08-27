import { Component, ElementRef, OnDestroy, ViewChild, inject } from '@angular/core';
import { ActionBarItemComponent, IconDirective, TitleComponent } from '@c8y/ngx-components';
import { IdentitiesComponent } from './identities/identities.component';
import { ManagedObjectViewComponent } from './json-view/managed-object-view.component';
import { InventorySearchComponent } from './search/inventory-search.component';
import { InventoryNavigationService } from './state/inventory-navigation.service';

const SEARCH_STORAGE_KEY = 'inventory-browser.search-results-height-px';
const TOP_STORAGE_KEY = 'inventory-browser.json-view-height-px';
const DEFAULT_SEARCH_HEIGHT_PX = 160;
const MIN_SEARCH_HEIGHT_PX = 90;
const DEFAULT_TOP_HEIGHT_PX = 480;
const MIN_TOP_HEIGHT_PX = 200;
const MIN_BOTTOM_HEIGHT_PX = 120;
const DIVIDER_HEIGHT_PX = 9;

type ResizeTarget = 'search' | 'json';

@Component({
  selector: 'app-inventory-browser',
  standalone: true,
  imports: [
    ActionBarItemComponent,
    IconDirective,
    TitleComponent,
    InventorySearchComponent,
    ManagedObjectViewComponent,
    IdentitiesComponent,
  ],
  templateUrl: './inventory-browser.component.html',
  styleUrl: './inventory-browser.component.scss',
})
export class InventoryBrowserComponent implements OnDestroy {
  protected readonly nav = inject(InventoryNavigationService);

  @ViewChild('resizableRegion') private resizableRegion?: ElementRef<HTMLDivElement>;

  protected searchHeightPx = readStoredHeight(SEARCH_STORAGE_KEY, DEFAULT_SEARCH_HEIGHT_PX, MIN_SEARCH_HEIGHT_PX);
  protected topHeightPx = readStoredHeight(TOP_STORAGE_KEY, DEFAULT_TOP_HEIGHT_PX, MIN_TOP_HEIGHT_PX);
  protected resizing: ResizeTarget | null = null;
  private startY = 0;
  private startSearchHeight = 0;
  private startTopHeight = 0;
  private readonly onMouseMove = (event: MouseEvent): void => this.handleMouseMove(event);
  private readonly onMouseUp = (): void => this.handleMouseUp();

  protected get pageTitle(): string {
    const obj = this.nav.currentObject();
    if (!obj) {
      return 'Inventory View';
    }
    const name = (obj['name'] as string | undefined) ?? obj.id;
    return `Inventory View — ${name}`;
  }

  onDividerMouseDown(event: MouseEvent, target: ResizeTarget): void {
    event.preventDefault();
    this.resizing = target;
    this.startY = event.clientY;
    this.startSearchHeight = this.searchHeightPx;
    this.startTopHeight = this.topHeightPx;
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
  }

  ngOnDestroy(): void {
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.resizing) {
      return;
    }
    const delta = event.clientY - this.startY;
    const regionHeight = this.resizableRegion?.nativeElement.getBoundingClientRect().height;
    const dividersHeight = DIVIDER_HEIGHT_PX * 2;

    if (this.resizing === 'search') {
      let next = Math.max(MIN_SEARCH_HEIGHT_PX, this.startSearchHeight + delta);
      if (regionHeight) {
        const max = Math.max(MIN_SEARCH_HEIGHT_PX, regionHeight - dividersHeight - this.topHeightPx - MIN_BOTTOM_HEIGHT_PX);
        next = Math.min(next, max);
      }
      this.searchHeightPx = next;
    } else {
      let next = Math.max(MIN_TOP_HEIGHT_PX, this.startTopHeight + delta);
      if (regionHeight) {
        const max = Math.max(MIN_TOP_HEIGHT_PX, regionHeight - dividersHeight - this.searchHeightPx - MIN_BOTTOM_HEIGHT_PX);
        next = Math.min(next, max);
      }
      this.topHeightPx = next;
    }
  }

  private handleMouseUp(): void {
    if (!this.resizing) {
      return;
    }
    const resized = this.resizing;
    this.resizing = null;
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
    try {
      if (resized === 'search') {
        localStorage.setItem(SEARCH_STORAGE_KEY, String(this.searchHeightPx));
      } else {
        localStorage.setItem(TOP_STORAGE_KEY, String(this.topHeightPx));
      }
    } catch {
      // Private browsing / storage disabled — the resized height just won't persist.
    }
  }
}

function readStoredHeight(key: string, fallback: number, min: number): number {
  try {
    const stored = Number(localStorage.getItem(key));
    return Number.isFinite(stored) && stored >= min ? stored : fallback;
  } catch {
    return fallback;
  }
}
