// SPDX-License-Identifier: GPL-3.0-or-later
// Search: your bookmarks first, then the search engine: one of the built-in ones below (Google unless you pick
// another), or one you add with a search address and, optionally, a suggestions address in the common OpenSearch form
// (["text", ["suggestion", …]]). Suggestions go only to the engine you picked, only
// while you type in search, and only when the Suggestions setting is on.
import type { DialItem } from '@openmarks/module-sdk';
import type { CustomEngine } from './prefs.svelte';
import { bm, type Node } from './bm';

/** custom: one you added; edited: a built-in one you changed (your version is kept in prefs.engines under its id). */
export type Engine = { id: string; name: string; url: string; suggest?: string; custom?: boolean; edited?: boolean };

export const builtInEngines: Engine[] = [
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=%s', suggest: 'https://suggestqueries.google.com/complete/search?client=firefox&q=%s' },
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s', suggest: 'https://duckduckgo.com/ac/?type=list&q=%s' },
  { id: 'startpage', name: 'Startpage', url: 'https://www.startpage.com/do/search?q=%s', suggest: 'https://www.startpage.com/osuggestions?q=%s' },
  { id: 'brave', name: 'Brave Search', url: 'https://search.brave.com/search?q=%s', suggest: 'https://search.brave.com/api/suggest?q=%s' },
];

/** The built-in engines (your version of any you edited, in its place), then the ones you added. */
export function allEngines(own: CustomEngine[]): Engine[] {
  const builtIn = new Set(builtInEngines.map((b) => b.id));
  return [
    ...builtInEngines.map((b) => { const mine = own.find((e) => e.id === b.id); return mine ? { ...mine, edited: true } : b; }),
    ...own.filter((e) => !builtIn.has(e.id)).map((e) => ({ ...e, custom: true })),
  ];
}
/** The engine with this id; Google when it's gone (removed, or the old "browser default"). */
export const engineById = (id: string, own: CustomEngine[]) => allEngines(own).find((e) => e.id === id) ?? builtInEngines[0]!;

const fill = (template: string, text: string) => template.replaceAll('%s', encodeURIComponent(text));

/** The engine's results page for `text`. */
export const searchUrl = (engine: Engine, text: string) => fill(engine.url, text);
/** Searches the web for `text` with the engine, in this tab. */
export function searchWeb(engine: Engine, text: string) {
  location.href = searchUrl(engine, text);
}

/** The engine's suggestions for `text` (empty when it has none, is slow or says no). */
export async function suggestions(engine: Engine, text: string, signal: AbortSignal): Promise<string[]> {
  if (!engine.suggest || !text.trim()) return [];
  try {
    const res = await fetch(fill(engine.suggest, text), { credentials: 'omit', signal: AbortSignal.any([signal, AbortSignal.timeout(2500)]) });
    if (!res.ok) return [];
    const j = (await res.json()) as unknown;
    const list = Array.isArray(j) && Array.isArray(j[1]) ? (j[1] as unknown[]) : [];
    return list.filter((s): s is string => typeof s === 'string' && s.trim() !== '' && s.toLowerCase() !== text.trim().toLowerCase()).slice(0, 6);
  } catch {
    return [];
  }
}

/** The web address `text` is, typed the way you would in an address bar ("google.com", "www.example.org/path",
 *  "https://…", "localhost:3000", "192.168.1.1"); null when it reads as words to search for. Bare names need a real
 *  looking ending (letters, two or more: "node.js" counts, "v1.2" doesn't). */
export function addressOf(text: string): string | null {
  const t = text.trim();
  if (!t || /\s/.test(t)) return null;
  const parse = (u: string) => {
    try {
      return new URL(u).href;
    } catch {
      return null;
    }
  };
  if (/^(https?|ftp|file):\/\//i.test(t)) return parse(t);
  if (/^localhost(:\d+)?(\/\S*)?$/i.test(t) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/\S*)?$/.test(t)) return parse('http://' + t);
  if (/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}\.?(:\d+)?([/?#]\S*)?$/i.test(t)) return parse('https://' + t);
  return null;
}

/** Checks an engine you're adding; returns what's wrong with it, or ''. */
export function checkEngine(name: string, url: string, suggest: string): string {
  if (!name.trim()) return 'Give it a name.';
  const ok = (u: string) => /^https?:\/\/[^\s]+$/.test(u) && u.includes('%s');
  if (!ok(url.trim())) return 'The search address must start with https:// and contain %s where the search text goes.';
  if (suggest.trim() && !ok(suggest.trim())) return 'The suggestions address must start with https:// and contain %s, or be left empty.';
  return '';
}

// ── Finding bookmarks ──────────────────────────────────────────────────────────

export type Hit = { item: DialItem; where: string; score: number };

/** How well `text` matches a title and address: whole words count, the start of the title most. 0 = no match. */
export function score(text: string, title: string, url = ''): number {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const t = title.toLowerCase();
  let host = '';
  try {
    host = url ? new URL(url).hostname.replace(/^www\./, '') : '';
  } catch {
    /* not a web address */
  }
  const rest = url.toLowerCase();
  let total = 0;
  for (const w of words) {
    const s = t.startsWith(w) ? 100 : new RegExp(`(^|[\\s\\-_./:])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t) ? 80
      : host.startsWith(w) ? 70 : t.includes(w) ? 50 : host.includes(w) ? 40 : rest.includes(w) ? 20 : 0;
    if (!s) return 0; // every word has to match somewhere
    total += s;
  }
  return total / words.length - Math.min(10, title.length / 20); // shorter titles a little ahead on a tie
}

/** Best matches first. */
export function rank(text: string, items: { item: DialItem; where: string }[], limit: number): Hit[] {
  return items
    .map((e) => ({ ...e, score: score(text, e.item.title, e.item.kind === 'link' ? e.item.url : '') }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Every bookmark in the browser outside the dial folder, with the path of folders it's in. */
export async function otherBookmarks(dialId: string): Promise<{ item: DialItem; where: string }[]> {
  const out: { item: DialItem; where: string }[] = [];
  const walk = (n: Node, path: string[]) => {
    if (n.id === dialId) return;
    if (n.url !== undefined) {
      if (/^https?:/.test(n.url)) out.push({ item: { kind: 'link', id: n.id, title: n.title, url: n.url }, where: path.filter(Boolean).join(' › ') });
      return;
    }
    for (const c of n.children ?? []) walk(c, n.title ? [...path, n.title] : path);
  };
  try {
    for (const r of await bm.tree()) walk(r, []);
  } catch {
    /* bookmarks unavailable */
  }
  return out;
}
