// SPDX-License-Identifier: GPL-3.0-or-later
// Wallpapers: the user's own picture (IndexedDB + persistent storage, so it survives
// restarts) and a daily picture from free sources, fetched straight from each provider, once a day.
//   bing: Bing image of the day (public JSON, no key)
//   wikimedia: Wikimedia Commons picture of the day (api.wikimedia.org feed, no key); days whose picture isn't
//               wallpaper material (portrait, small, SVG/GIF diagrams) step back to the latest one that is
//   picsum: Unsplash photos from the Openmarks daily feed (a short list per day, so "new picture" steps through it)
import type { Provider } from './prefs.svelte';

const DB = 'proto-openmarks';
const STORE = 'files';

function db(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}

export async function saveWallpaper(file: Blob): Promise<string> {
  await navigator.storage?.persist?.();
  const d = await db();
  await new Promise<void>((ok, fail) => {
    const t = d.transaction(STORE, 'readwrite');
    t.objectStore(STORE).put(file, 'wallpaper');
    t.oncomplete = () => ok();
    t.onerror = () => fail(t.error);
  });
  return URL.createObjectURL(file);
}

export async function loadWallpaper(): Promise<string | null> {
  const d = await db();
  const blob = await new Promise<Blob | undefined>((ok) => {
    const r = d.transaction(STORE).objectStore(STORE).get('wallpaper');
    r.onsuccess = () => ok(r.result as Blob | undefined);
    r.onerror = () => ok(undefined);
  });
  return blob ? URL.createObjectURL(blob) : null;
}

export type Daily = { url: string; credit: string; link?: string };
export const providers: Record<Provider, string> = { bing: 'Bing', wikimedia: 'Wikimedia', picsum: 'Unsplash' };

/** Today's date in the user's own time zone (a new day starts at their midnight, not UTC's). */
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** A small (≈ 480 px) copy of a daily picture's address, for the preview cards: each source has its own resize form. */
export function previewOf(url: string): string {
  if (url.includes('bing.com/th?')) return `${url}&w=480`;
  if (url.includes('wikimedia.org') && /\/\d+px-/.test(url)) return url.replace(/\/\d+px-/, '/500px-');
  if (url.includes('images.unsplash.com')) return url.replace(/([?&])w=\d+/, '$1w=480');
  return url;
}

const FEED = 'https://rishabh0111.github.io/openmarks/daily.json';
type FeedPhoto = { url: string; author: string; authorUrl: string; photoUrl: string };

async function fetchDaily(p: Provider, step = 0): Promise<Daily> {
  if (p === 'bing') {
    const j = await (await fetch('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=en-US')).json();
    const img = j.images[0];
    return { url: `https://www.bing.com${img.urlbase}_UHD.jpg`, credit: img.copyright, link: img.copyrightlink };
  }
  if (p === 'wikimedia') {
    // Today's picture, or the most recent of the last 7 days that works as a wallpaper.
    for (let back = 0; back < 7; back++) {
      const day = new Date(Date.now() - back * 864e5).toISOString().slice(0, 10);
      const [y, m, d] = day.split('-');
      const j = await (await fetch(`https://api.wikimedia.org/feed/v1/wikipedia/en/featured/${y}/${m}/${d}`, { headers: { 'Api-User-Agent': 'Openmarks/1.0 (Firefox extension)' } })).json();
      const img = j.image;
      if (!img?.image) continue;
      const { width, height } = img.image as { width: number; height: number };
      const isPhoto = !/\.(svg|gif|tiff?)(\?|$)/i.test(img.image.source as string);
      if (!isPhoto || width < 1600 || width / height < 1.2) continue; // portrait, small, or a diagram: not a wallpaper
      // Wikimedia serves resized copies only at standard widths (others answer 400): take the smallest that covers
      // the screen, or the original when it's smaller than that.
      const need = Math.round(screen.width * (devicePixelRatio || 1));
      const std = [1280, 1920, 3840].find((x) => x >= need) ?? 3840;
      const src = img.thumbnail?.source && width > std ? img.thumbnail.source.replace(/\/\d+px-/, `/${std}px-`) : img.image.source;
      return { url: src, credit: `${img.description?.text ?? 'Picture of the day'} · ${img.artist?.text ?? 'Wikimedia Commons'}`.replace(/<[^>]+>/g, ''), link: img.file_page };
    }
    throw new Error('No wallpaper-ready picture this week');
  }
  // Unsplash: today's short list from the Openmarks daily feed; `step` picks one (new picture = next step). Per
  // Unsplash's guidelines the image URL is hotlinked and photographer and Unsplash are credited with referral links.
  const j = (await (await fetch(FEED, { cache: 'no-cache' })).json()) as { unsplash?: FeedPhoto[] };
  const list = j.unsplash ?? [];
  if (!list.length) throw new Error('Empty Unsplash feed');
  const ph = list[step % list.length]!;
  const ref = 'utm_source=openmarks&utm_medium=referral';
  const w = Math.min(3840, Math.round(screen.width * (devicePixelRatio || 1)));
  const sep = (u: string) => (u.includes('?') ? '&' : '?');
  return { url: `${ph.url}${sep(ph.url)}w=${w}&q=82&fm=jpg&fit=max`, credit: `Photo by ${ph.author} on Unsplash`, link: `${ph.authorUrl}${sep(ph.authorUrl)}${ref}` };
}

/**
 * Today's picture for a source. Kept for the day; re-checked when it's over 3 hours old, because sources publish at
 * their own midnight (Bing's US picture lands around 08:00 UTC), so a picture fetched before that would otherwise be
 * yesterday's all day. Unsplash keeps its picture until you ask for a new one (or the day changes).
 */
export async function dailyWallpaper(p: Provider, refresh = false): Promise<Daily> {
  const key = `proto-daily2:${p}`;
  const c = JSON.parse(localStorage.getItem(key) ?? 'null') as (Daily & { day: string; at?: number; step?: number }) | null;
  const fresh = c && c.day === today() && (p === 'picsum' || Date.now() - (c.at ?? 0) < 3 * 3600e3);
  if (c && fresh && !refresh) return c;
  const step = c && c.day === today() ? (c.step ?? 0) + (refresh ? 1 : 0) : 0;
  try {
    const d = await fetchDaily(p, step);
    localStorage.setItem(key, JSON.stringify({ ...d, day: today(), at: Date.now(), step }));
    return d;
  } catch (e) {
    if (c && !refresh) return c; // offline or the source is down: keep the last picture
    throw e;
  }
}

// ── First paint ───────────────────────────────────────────────────────────────
// A new tab must open on its final look, not flash the default and then swap. The page keeps:
//   proto-boot: the theme background and light/dark, painted by boot.js before any app code runs;
//   proto-wall-snap: a screen-sized copy of the current wallpaper (data URL), read synchronously at start.
export type Snap = { src: string; data: string };
const SNAP = 'proto-wall-snap';
export const readSnap = (): Snap | null => {
  try {
    return JSON.parse(localStorage.getItem(SNAP) ?? 'null') as Snap | null;
  } catch {
    return null;
  }
};
/** A screen-sized JPEG copy of a wallpaper, remembered for instant new tabs. */
export async function makeSnap(src: string, from: string): Promise<Snap | null> {
  try {
    const bmp = await createImageBitmap(await (await fetch(from)).blob());
    const W = Math.min(bmp.width, Math.round(screen.width * (devicePixelRatio || 1)), 3840); // native screen pixels, up to 4K
    const H = Math.round((bmp.height * W) / bmp.width);
    const c = new OffscreenCanvas(W, H);
    const x = c.getContext('2d')!;
    x.imageSmoothingQuality = 'high';
    x.drawImage(bmp, 0, 0, W, H);
    const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
    const data = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(blob); });
    const snap = { src, data };
    localStorage.setItem(SNAP, JSON.stringify(snap));
    return snap;
  } catch {
    return null;
  }
}
export const dropSnap = () => localStorage.removeItem(SNAP);
/** Today's cached daily picture, synchronously (null when it still has to be fetched). */
export function peekDaily(p: Provider): Daily | null {
  try {
    const c = JSON.parse(localStorage.getItem(`proto-daily2:${p}`) ?? 'null') as (Daily & { day: string }) | null;
    return c && c.day === today() ? c : null;
  } catch {
    return null;
  }
}
/** What boot.js paints first: the page background (theme colour or gradient), light/dark, and whether a wallpaper follows. */
export function saveBoot(b: { bg: string; dark: boolean; wall: boolean }) {
  try {
    localStorage.setItem('proto-boot', JSON.stringify(b));
  } catch {
    /* ignore */
  }
}
