// SPDX-License-Identifier: GPL-3.0-or-later
// Private windows (Firefox): the extension's pages there get their own storage, empty when the private session starts
// (or unusable), so every private tab would start cold: the default look, then every picture fetched and popping in
// again. In a private window the page reads the normal window's copies through the background script instead
// (apps/extension/entrypoints/background.ts), and sends what it saves back there. Elsewhere this does nothing.

type Rt = { runtime?: { sendMessage(m: object): Promise<unknown> }; extension?: { inIncognitoContext?: boolean } };
const g = globalThis as { browser?: Rt; chrome?: Rt };
const api = g.browser ?? g.chrome;
export const isPrivate = !!api?.extension?.inIncognitoContext;

type Normal = { local: Record<string, string>; entries: [IDBValidKey, unknown][] };
async function ask(m: object): Promise<Normal> {
  try {
    return ((await api?.runtime?.sendMessage({ type: 'om-normal', ...m })) as Normal | undefined) ?? { local: {}, entries: [] };
  } catch {
    return { local: {}, entries: [] };
  }
}

/** Copies the normal window's settings into this private window's localStorage, before the dial reads them. */
export async function seedPrivate() {
  if (!isPrivate) return;
  for (const [k, v] of Object.entries((await ask({ local: true })).local)) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* full: that one stays at its default */
    }
  }
}

/** Entries of one of the normal window's IndexedDB stores (all of them, or just `key`). */
export const normalEntries = async (db: string, store: string, key?: string) => (await ask({ db, store, key })).entries;

/** Saves to the normal window's IndexedDB store, or its localStorage when no store is given. */
export function putNormal(key: string, value: unknown, db?: string, store?: string) {
  if (isPrivate) void api?.runtime?.sendMessage({ type: 'om-put', db, store, key, value })?.catch(() => {});
}
