import { ApplicationConfig, importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { CoreModule, RouterModule } from '@c8y/ngx-components';
import { FetchClient, IdentityService } from '@c8y/client';
import { inventoryBrowserProviders } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection(),
    provideAnimations(),
    importProvidersFrom(RouterModule.forRoot()),
    importProvidersFrom(CoreModule.forRoot()),
    { provide: IdentityService, useFactory: (client: FetchClient) => new IdentityService(client), deps: [FetchClient] },
    ...inventoryBrowserProviders,
  ],
};
