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
    // unlimitedStorage: your uploaded wallpaper, picture cache and screenshots are kept safe from the browser's clean-up
    // without Firefox asking "allow persistent storage?" (navigator.storage.persist() is granted at once). It adds no
    // line to the install warning.
    permissions: ['bookmarks', 'storage', 'unlimitedStorage', 'tabs', 'contextMenus', 'scripting', ...(browser === 'firefox' ? [] : ['favicon'])],
    // <all_urls>: page previews and tab screenshots (captureVisibleTab).
    host_permissions: ['<all_urls>'],
    ...(browser === 'firefox' ? {
      // Firefox opens its homepage, not a new tab, when it starts: make that the dial too. (Chromium starts on the
      // new tab page, which the newtab override already covers.)
      chrome_settings_overrides: { homepage: 'newtab.html' },
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
