// SPDX-License-Identifier: GPL-3.0-or-later
// Page screenshots for tiles (like Vivaldi's). Shared by the new-tab page and the background script:
// both are the extension's origin, so they share this IndexedDB store; a BroadcastChannel tells open pages when a
// new screenshot lands. Screenshots are taken only for sites that asked for one (Screenshot pictures), never sent.

export const DB = 'openmarks-proto-shots', STORE = 's';
export type Shot = { blob: Blob; at: number };

/** Same site and path, ignoring www., scheme, a trailing slash and the hash. */
export function shotKey(u: string): string {
  try {
    const x = new URL(u);
    return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/$/, '') + x.search).toLowerCase();
  } catch {
    return u;
  }
}

let db: Promise<IDBDatabase> | null = null;
export function open(): Promise<IDBDatabase> {
  db ??= new Promise((ok, fail) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
  return db;
}
export const req = <T,>(r: IDBRequest<T>) => new Promise<T>((ok, fail) => { r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error); });

export async function getShot(url: string): Promise<Shot | undefined> {
  return req((await open()).transaction(STORE).objectStore(STORE).get(shotKey(url)) as IDBRequest<Shot | undefined>);
}
export async function putShot(url: string, blob: Blob) {
  await req((await open()).transaction(STORE, 'readwrite').objectStore(STORE).put({ blob, at: Date.now() } satisfies Shot, shotKey(url)));
  new BroadcastChannel('openmarks-shots').postMessage(shotKey(url));
}

/** A screen capture cropped to the tile shape (16:10, from the top) and sized for the tile at this density. */
export async function tileShot(capture: Blob, width: number): Promise<Blob> {
  const bmp = await createImageBitmap(capture);
  const sw = bmp.width, sh = Math.min(bmp.height, Math.round((sw * 10) / 16));
  const w = Math.min(width, sw), h = Math.round((w * 10) / 16);
  const c = new OffscreenCanvas(w, h);
  const x = c.getContext('2d')!;
  x.imageSmoothingQuality = 'high';
  x.drawImage(bmp, 0, 0, sw, sh, 0, 0, w, h);
  return c.convertToBlob({ type: 'image/webp', quality: 0.86 });
}

