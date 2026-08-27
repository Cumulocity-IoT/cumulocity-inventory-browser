import { Component, ElementRef, OnDestroy, ViewChild, inject } from '@angular/core';
import { ActionBarItemComponent, IconDirective, TitleComponent } from '@c8y/ngx-components';
import { IdentitiesComponent } from './identities/identities.component';
import { ManagedObjectViewComponent } from './json-view/managed-object-view.component';
import { InventorySearchComponent } from './search/inventory-search.component';
import { InventoryNavigationService } from './state/inventory-navigation.service';

const STORAGE_KEY = 'inventory-browser.json-view-height-px';
const DEFAULT_TOP_HEIGHT_PX = 480;
const MIN_TOP_HEIGHT_PX = 200;
const MIN_BOTTOM_HEIGHT_PX = 120;
const DIVIDER_HEIGHT_PX = 9;

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

  protected topHeightPx = readStoredHeight();
  protected resizing = false;
  private startY = 0;
  private startHeight = 0;
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

  onDividerMouseDown(event: MouseEvent): void {
    event.preventDefault();
    this.resizing = true;
    this.startY = event.clientY;
    this.startHeight = this.topHeightPx;
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
    let next = Math.max(MIN_TOP_HEIGHT_PX, this.startHeight + delta);

    const regionHeight = this.resizableRegion?.nativeElement.getBoundingClientRect().height;
    if (regionHeight) {
      const maxTop = Math.max(MIN_TOP_HEIGHT_PX, regionHeight - DIVIDER_HEIGHT_PX - MIN_BOTTOM_HEIGHT_PX);
      next = Math.min(next, maxTop);
    }
    this.topHeightPx = next;
  }

  private handleMouseUp(): void {
    if (!this.resizing) {
      return;
    }
    this.resizing = false;
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
    try {
      localStorage.setItem(STORAGE_KEY, String(this.topHeightPx));
    } catch {
      // Private browsing / storage disabled — the resized height just won't persist.
    }
  }
}

function readStoredHeight(): number {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(stored) && stored >= MIN_TOP_HEIGHT_PX ? stored : DEFAULT_TOP_HEIGHT_PX;
  } catch {
    return DEFAULT_TOP_HEIGHT_PX;
  }
}
