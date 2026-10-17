// SPDX-License-Identifier: GPL-3.0-or-later
// Settings: a small Vivaldi-like set, shown visually; everything else fixed.

export type TileSize = 'icon' | 'S' | 'M' | 'L' | 'XL';
export type Provider = 'bing' | 'wikimedia' | 'picsum';
export type Wallpaper =
  | { kind: 'none' }
  | { kind: 'color'; color: string }
  | { kind: 'gradient'; colors: string[]; angle: number }
  | { kind: 'image' } // uploaded file, kept in IndexedDB
  | { kind: 'daily'; provider: Provider };

export type Prefs = {
  theme: 'auto' | 'light' | 'dark'; // light/dark mode
  themeId: string; // the look (themes.ts)
  glass: boolean; // translucent tiles over the wallpaper (shown as "Transparency")
  vim: boolean; // h j k l, gg, G, o / O, H / L
  tileSize: TileSize;
  pictures: 'cover' | 'logo' | 'shot'; // what tiles show by default: the page's cover image, its logo, or a screenshot
  titles: 'show' | 'hover' | 'hide';
  maxColumns: number; // 0 = as many as fit (capped at 10)
  search: boolean;
  addButton: boolean;
  clock: boolean;
  wallpaper: Wallpaper;
  dialFolder: string | null; // null = the default "Openmarks" folder
};

const defaults: Prefs = {
  theme: 'auto', themeId: 'openmarks', glass: true, vim: false, tileSize: 'M', pictures: 'cover', titles: 'show', maxColumns: 0, search: true, addButton: true, clock: false,
  wallpaper: { kind: 'none' }, dialFolder: null,
};

/** Fixed (no setting): spacing, corners, title size. Target tile widths; actual width stretches to fill each row. */
export const fixed = { gap: 20, radius: 10, fontSize: 14, cap: 10, target: { icon: 92, S: 148, M: 188, L: 236, XL: 300 } as Record<TileSize, number> };

const KEY = 'proto-prefs-v7';
const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>;
  } catch {
    return {};
  }
})();

export const prefs = $state<Prefs>({ ...defaults, ...saved });
// NASA was removed as a daily source: anyone who had it gets Bing.
if (prefs.wallpaper.kind === 'daily' && !['bing', 'wikimedia', 'picsum'].includes(prefs.wallpaper.provider)) prefs.wallpaper = { kind: 'daily', provider: 'bing' };
// The navy theme was renamed to Vapor: map its old saved id (split so the old name stays out of searches).
if ((prefs.themeId as string) === 'st' + 'eam') prefs.themeId = 'vapor';

/** Bumped when site access changes, so tiles re-read their pictures. */
export const epoch = $state({ n: 0 });

export function savePrefs() {
  localStorage.setItem(KEY, JSON.stringify(prefs));
  // The right-click "Add to Speed Dial" (background) adds to the same folder the dial shows.
  (globalThis as { chrome?: { storage?: { local?: { set(v: object): unknown } } } }).chrome?.storage?.local?.set({ 'proto-dialFolder': prefs.dialFolder });
}

// Keep the background's copy of the dial folder current from the start.
(globalThis as { chrome?: { storage?: { local?: { set(v: object): unknown } } } }).chrome?.storage?.local?.set({ 'proto-dialFolder': prefs.dialFolder });
