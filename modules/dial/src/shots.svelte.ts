// SPDX-License-Identifier: GPL-3.0-or-later
// Page side of shots.ts: every screenshot in memory as an object URL, kept current as new ones land.
import { open, req, shotKey, STORE, type Shot } from './shots';

const mem = new Map<string, string>();
export const shotsVersion = $state({ n: 0 });
async function loadOne(key: string) {
  const s = await req((await open()).transaction(STORE).objectStore(STORE).get(key) as IDBRequest<Shot | undefined>);
  if (!s) return;
  const old = mem.get(key);
  if (old) URL.revokeObjectURL(old);
  mem.set(key, URL.createObjectURL(s.blob));
  shotsVersion.n++;
}
export const shotsReady: Promise<void> = typeof document === 'undefined' ? Promise.resolve() : (async () => {
  try {
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
  return (await chromeApi()?.runtime?.sendMessage({ type: 'capture', urls }))?.n ?? 0;
}
/** Tell the background which sites want a screenshot when visited, and the screen density to size them for. */
export function wantShots(urls: string[]) {
  chromeApi()?.storage?.local?.set({ 'proto-shot-urls': urls, 'proto-density': Math.min(4, Math.ceil((globalThis.devicePixelRatio || 1) * 2) / 2) });
}
