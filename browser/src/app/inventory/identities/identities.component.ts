import { NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { IdentityEntry } from '../state/inventory.model';
import { InventoryNavigationService } from '../state/inventory-navigation.service';

const COPIED_FEEDBACK_MS = 1200;
/** Chips shown inline in the toolbar; the rest go behind a "+N more" popover. */
const VISIBLE_CHIPS = 2;

@Component({
  selector: 'app-identities',
  standalone: true,
  imports: [NgTemplateOutlet],
  templateUrl: './identities.component.html',
  styleUrl: './identities.component.scss',
})
export class IdentitiesComponent {
  protected readonly nav = inject(InventoryNavigationService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly visible = computed<IdentityEntry[]>(() => this.nav.identities().slice(0, VISIBLE_CHIPS));
  protected readonly overflow = computed<IdentityEntry[]>(() => this.nav.identities().slice(VISIBLE_CHIPS));

  /** Key (`type:externalId`) of the chip that was just copied — shows brief "Copied" feedback. */
  protected readonly copiedKey = signal<string | null>(null);
  protected readonly popoverOpen = signal(false);
  /** `position: fixed` coordinates — the host scrolls horizontally, so an absolute popover would be clipped. */
  protected readonly popoverPos = signal({ top: 0, left: 0 });

  protected key(entry: IdentityEntry): string {
    return `${entry.type}:${entry.externalId}`;
  }

  protected async copy(entry: IdentityEntry): Promise<void> {
    try {
      await navigator.clipboard.writeText(entry.externalId);
    } catch {
      return; // Clipboard unavailable (insecure context / permission denied) — nothing to confirm.
    }
    const key = this.key(entry);
    this.copiedKey.set(key);
    setTimeout(() => this.copiedKey() === key && this.copiedKey.set(null), COPIED_FEEDBACK_MS);
  }

  protected togglePopover(event: MouseEvent): void {
    if (!this.popoverOpen()) {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      this.popoverPos.set({ top: rect.bottom + 4, left: rect.left });
    }
    this.popoverOpen.update((open) => !open);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (this.popoverOpen() && !this.host.nativeElement.contains(event.target as Node)) {
      this.popoverOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected closePopover(): void {
    this.popoverOpen.set(false);
  }
}
