// SPDX-License-Identifier: GPL-3.0-or-later
import { browser } from 'wxt/browser';
import { loadDial } from '@openmarks/core';
import type { ModuleApi, ModuleManifest } from '@openmarks/module-sdk';

/** The API a Module gets. */
export function apiFor(_manifest: ModuleManifest): ModuleApi {
  return {
    bookmarks: {
      dial: () => loadDial(browser.bookmarks, async (fn) => navigator.locks.request('openmarks-dial-folder', fn)),
    },
  };
}
