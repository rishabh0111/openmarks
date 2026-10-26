// SPDX-License-Identifier: GPL-3.0-or-later
// Page side of shots.ts: every screenshot in memory as an object URL, kept current as new ones land.
import { DB, open, req, shotKey, STORE, type Shot } from './shots';
import { isPrivate, normalEntries } from './private';

const mem = new Map<string, string>();
export const shotsVersion = $state({ n: 0 });
async function loadOne(key: string, s?: Shot) {
  s ??= isPrivate
    ? ((await normalEntries(DB, STORE, key))[0]?.[1] as Shot | undefined)
    : await req((await open()).transaction(STORE).objectStore(STORE).get(key) as IDBRequest<Shot | undefined>);
  if (!s) return;
  const old = mem.get(key);
  if (old) URL.revokeObjectURL(old);
  mem.set(key, URL.createObjectURL(s.blob));
  shotsVersion.n++;
}
export const shotsReady: Promise<void> = typeof document === 'undefined' ? Promise.resolve() : (async () => {
  try {
    if (isPrivate) {
      for (const [k, s] of await normalEntries(DB, STORE)) await loadOne(String(k), s as Shot);
      return;
    }
    const d = await open();
    const keys = await req(d.transaction(STORE).objectStore(STORE).getAllKeys());
    await Promise.all(keys.map((k) => loadOne(String(k))));
    new BroadcastChannel('openmarks-shots').onmessage = (e) => void loadOne(String(e.data));
  } catch {
    /* no IndexedDB */
  }
})();
/** The screenshot for a URL, as an object URL (read `shotsVersion.n` to react to new ones). */
export const peekShot = (url: string) => mem.get(shotKey(url));

type Chrome = { runtime?: { sendMessage(m: object): Promise<{ n: number } | undefined> }; storage?: { local?: { set(v: object): unknown } } };
const chromeApi = () => (globalThis as { chrome?: Chrome }).chrome;
/** Ask the background to load these pages for a moment and screenshot them. Resolves with how many it captured. */
export async function requestShots(urls: string[]): Promise<number> {
  const n = (await chromeApi()?.runtime?.sendMessage({ type: 'capture', urls }))?.n ?? 0;
  // A private window doesn't hear the background's "new screenshot" broadcast: read the new ones now.
  if (isPrivate) await Promise.all(urls.map((u) => loadOne(shotKey(u))));
  return n;
}
/** Tell the background which sites want a screenshot when visited, and the screen density to size them for. */
export function wantShots(urls: string[]) {
  chromeApi()?.storage?.local?.set({ 'proto-shot-urls': urls, 'proto-density': Math.min(4, Math.ceil((globalThis.devicePixelRatio || 1) * 2) / 2) });
}
