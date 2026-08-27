import { Component, inject } from '@angular/core';
import { InventoryNavigationService } from '../state/inventory-navigation.service';

@Component({
  selector: 'app-identities',
  standalone: true,
  imports: [],
  templateUrl: './identities.component.html',
  styleUrl: './identities.component.scss',
})
export class IdentitiesComponent {
  protected readonly nav = inject(InventoryNavigationService);
}
