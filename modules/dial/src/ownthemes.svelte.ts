// SPDX-License-Identifier: GPL-3.0-or-later
// Themes loaded from your own CSS files (themes.ts, "Your own theme"), kept in localStorage as the files themselves
// and read into themes when the page starts.
import { themeFromCss, type Theme } from './themes';
import { putNormal } from './private';

type Saved = { id: string; file: string; css: string };
const KEY = 'proto-own-themes';
const saved = (): Saved[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Saved[];
  } catch {
    return [];
  }
};
const toTheme = (s: Saved) => themeFromCss(s.css, s.id, s.file);

export const ownThemes = $state<{ list: Theme[] }>({ list: saved().map(toTheme).filter((t): t is Theme => !!t) });

function store(list: Saved[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
  putNormal(KEY, localStorage.getItem(KEY));
}

/** Adds (or, for a file of the same name, replaces) a theme from a CSS file. Returns it, or an error to show. */
export function addOwnTheme(file: string, css: string): Theme | string {
  if (css.length > 256 * 1024) return 'That file is over 256 KB.';
  const list = saved();
  const id = list.find((s) => s.file === file)?.id ?? `css-${Date.now().toString(36)}`;
  const t = toTheme({ id, file, css });
  if (!t) return 'That file has no theme in it: no custom properties (--bg, --surface…) and no rules.';
  try {
    store([...list.filter((s) => s.id !== id), { id, file, css }]);
  } catch {
    return 'There’s no room left to keep that theme.';
  }
  ownThemes.list = [...ownThemes.list.filter((x) => x.id !== id), t];
  return t;
}

export function removeOwnTheme(id: string) {
  store(saved().filter((s) => s.id !== id));
  ownThemes.list = ownThemes.list.filter((t) => t.id !== id);
}

/** The CSS file a theme was loaded from (what "Download" gives back for your own themes). */
export const ownThemeFile = (id: string) => saved().find((s) => s.id === id);
