import type { ConfigurationOptions } from '@c8y/devkit';
import { version, license } from './package.json';

export default {
  runTime: {
    version,
    // Display name shown in the app's branding/header — kept separate from package.json's
    // `name`, which still drives the app's contextPath/key (URL and deployment identity).
    name: 'Inventory Browser',
    dynamicOptionsUrl: true,
    license,
  },
  buildTime: {
    federation: [
      '@angular/animations',
      '@angular/cdk',
      '@angular/common',
      '@angular/compiler',
      '@angular/core',
      '@angular/forms',
      '@angular/platform-browser',
      '@angular/platform-browser-dynamic',
      '@angular/router',
      '@c8y/client',
      '@c8y/ngx-components',
      'ngx-bootstrap',
      '@ngx-translate/core',
      '@ngx-formly/core',
    ],
  },
} as const satisfies ConfigurationOptions;
