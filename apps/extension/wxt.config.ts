// SPDX-License-Identifier: GPL-3.0-or-later
import { defineConfig } from 'wxt';
import pkg from './package.json' with { type: 'json' };

// The newtab entrypoint makes WXT write `chrome_url_overrides.newtab` into the manifest.
export default defineConfig({
  modules: ['@wxt-dev/module-svelte'],
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'Openmarks',
    description: 'A speed dial for the new tab page that keeps your links in your browser bookmarks.',
    version: pkg.version,
    permissions: ['bookmarks', 'storage', 'search', 'tabs', 'contextMenus', 'scripting', ...(browser === 'firefox' ? [] : ['favicon'])],
    // <all_urls>: page previews and tab screenshots (captureVisibleTab).
    host_permissions: ['<all_urls>'],
    ...(browser === 'firefox' ? {
      browser_specific_settings: {
        gecko: {
          id: 'openmarks@rishabh0111.github.io',
          strict_min_version: '140.0',
          data_collection_permissions: { required: ['none'] },
        },
      },
    } : {}),
  }),
  zip: {
    artifactTemplate: 'openmarks-{{version}}-{{browser}}.zip',
    sourcesTemplate: 'openmarks-{{version}}-sources.zip',
    sourcesRoot: '../..',
    includeSources: ['**/*', '.npmrc', '.nvmrc'],
    excludeSources: ['.*/**', '**/.*/**', '**/.env*', '**/node_modules/**', 'tools/**', 'site/**', '**/test-results/**'],
  },
});
