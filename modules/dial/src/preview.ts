// SPDX-License-Identifier: GPL-3.0-or-later
// Reads each dial page for its brand picture (og:image), its sharpest icon and its title.
// Icons are fetched by the extension and kept as data URLs, so sites that forbid hot-linking (Google) still show.
// Generated content images (map snapshots and the like) are rejected: tiles show brands, not live content.
import { perm } from './bm';
import { analyse, upscale, iconTarget, density, type IconInfo } from './iconlab';
import { isPrivate, normalEntries, putNormal } from './private';

export type { Tone, IconInfo } from './iconlab';
export type PreviewIcon = { src: string; px: number; info?: IconInfo };
export type Preview = {
  image?: string; title?: string;
  imageData?: string; // local copy of `image` (420 px × screen density, ≤ 1600 px, WebP), so tiles draw instantly and offline
  icon?: string; // = icons[0].src
  images?: string[]; // every brand picture the page offers (og:image, twitter:image, image_src)
  icons?: PreviewIcon[]; // every icon that decodes, sharpest first (data URLs); a small best one is reconstructed
};

// Cache: IndexedDB (no 5 MB limit, survives restarts), mirrored in memory and loaded once at start-up, so tiles draw
// their picture on the first frame instead of flashing a letter while it's looked up.
const DB = 'openmarks-proto-previews', STORE = 'p', VERSION = 14;
const mem = new Map<string, Preview>();
// Cached pictures are sized for the screen they were made on; a sharper screen (moved to a HiDPI monitor) rebuilds them.
const DPR_KEY = 'proto-preview-density';
if (!isPrivate && Number(localStorage.getItem(DPR_KEY) ?? 0) < density()) { indexedDB.deleteDatabase(DB); localStorage.setItem(DPR_KEY, String(density())); }
let db: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  db ??= new Promise((ok, fail) => {
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => {
      if (r.result.objectStoreNames.contains(STORE)) r.result.deleteObjectStore(STORE); // new format: start over
      r.result.createObjectStore(STORE);
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
  return db;
}
function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((d) => new Promise((ok, fail) => {
    const r = f(d.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  }));
}
/** Resolves once every cached preview is in memory (a few ms); the page waits for it before drawing tiles. */
export const cacheReady: Promise<void> = (async () => {
  if (isPrivate) {
    for (const [k, v] of await normalEntries(DB, STORE)) mem.set(String(k), v as Preview);
    return;
  }
  try {
    const d = await open();
    await new Promise<void>((ok) => {
      const r = d.transaction(STORE).objectStore(STORE).openCursor();
      r.onsuccess = () => {
        const c = r.result;
        if (!c) return ok();
        mem.set(String(c.key), c.value as Preview);
        c.continue();
      };
      r.onerror = () => ok();
    });
  } catch {
    /* no IndexedDB (private window): fetch as needed */
  }
})();
/** The cached preview, synchronously (after cacheReady). */
export const peekPreview = (url: string): Preview | undefined => mem.get(url);
/** Remember something about a URL that isn't the page's own preview (the browser favicon, reconstructed). */
export function remember(key: string, v: Preview) {
  mem.set(key, v);
  if (isPrivate) return putNormal(key, v, DB, STORE);
  void tx('readwrite', (s) => s.put(v, key)).catch(() => {});
}
const inflight = new Map<string, Promise<Preview>>();

/** Fingerprint of a blob, to recognise the browser's generic "no favicon" globe. */
export async function fingerprint(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let h = 0;
  for (let i = 0; i < buf.length; i++) h = (h * 31 + buf[i]!) | 0;
  return `${buf.length}:${h}`;
}

export function dataUrl(b: Blob): Promise<string> {
  return new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => fail(r.error);
    r.readAsDataURL(b);
  });
}

/** Fetch every candidate icon, keep the sharpest that decodes; returned as data URLs (no hot-linking). */
async function bestIcon(candidates: string[]): Promise<Pick<Preview, 'icon' | 'icons'>> {
  // All candidates in parallel, each with its own 4 s limit.
  const tries = await Promise.allSettled(
    [...new Set(candidates)].slice(0, 12).map(async (u) => {
      const res = await fetch(u, { credentials: 'omit', signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error(String(res.status));
      let blob = await res.blob();
      if (blob.size > 512 * 1024) throw new Error('too big');
      const svg = /svg/.test(blob.type) || /\.svg(\?|$)/i.test(u);
      if (svg) blob = new Blob([blob], { type: 'image/svg+xml' });
      const info = await analyse(blob, svg);
      if (!info || info.px < 16) throw new Error('not an icon');
      return { blob, px: info.px, info };
    }),
  );
  const ok = tries.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])).sort((a, b) => b.px - a.px);
  // Distinct sizes only, up to four.
  const seen = new Set<number>();
  const kept = ok.filter((i) => !seen.has(i.px) && seen.add(i.px)).slice(0, 4);
  // A small best icon is reconstructed at 256 px once, and cached.
  const want = iconTarget();
  if (kept[0] && kept[0].px < want * 0.6 && kept[0].blob.type !== 'image/svg+xml') {
    try {
      const blob = await upscale(kept[0].blob, want);
      kept[0] = { blob, px: want, info: (await analyse(blob)) ?? kept[0].info };
    } catch {
      /* keep the original */
    }
  }
  const icons = await Promise.all(kept.map(async (i) => ({ src: await dataUrl(i.blob), px: i.px, info: i.info })));
  return icons[0] ? { icon: icons[0].src, icons } : {};
}

/** A local, downsized copy of the page picture (or undefined when it can't be read). */
async function localCopy(u: string): Promise<string | undefined> {
  try {
    const res = await fetch(u, { credentials: 'omit', signal: AbortSignal.timeout(6000) });
    if (!res.ok) return undefined;
    const bmp = await createImageBitmap(await res.blob());
    const w = Math.min(Math.round(420 * density()), 1600, bmp.width), h = Math.round((bmp.height * w) / bmp.width);
    const c = new OffscreenCanvas(w, h);
    const x = c.getContext('2d')!;
    x.imageSmoothingQuality = 'high';
    x.drawImage(bmp, 0, 0, w, h);
    return await dataUrl(await c.convertToBlob({ type: 'image/webp', quality: 0.85 }));
  } catch {
    return undefined;
  }
}

/** Brand pictures only: reject generated content such as map snapshots. */
function brandImage(u: string | undefined): string | undefined {
  if (!u || !/^https?:/.test(u)) return undefined;
  if (/staticmap|maps\/api|[?&](center|markers|zoom)=/i.test(u)) return undefined;
  return u;
}

const WELL_KNOWN = ['/apple-touch-icon.png', '/apple-touch-icon-precomposed.png', '/android-chrome-192x192.png', '/favicon-192x192.png', '/favicon-96x96.png', '/favicon.ico'];

async function load(pageUrl: string): Promise<Preview> {
  const origin = new URL(pageUrl).origin;
  const known = WELL_KNOWN.map((p) => origin + p);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(pageUrl, { credentials: 'omit', signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return await bestIcon(known);
    const html = (await res.text()).slice(0, 768 * 1024);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const base = res.url || pageUrl;
    const abs = (u: string | null | undefined) => {
      try {
        return u ? new URL(u, base).href : undefined;
      } catch {
        return undefined;
      }
    };
    const meta = (sel: string) => doc.querySelector<HTMLMetaElement>(sel)?.content;
    const images = [...new Set(
      [...doc.querySelectorAll<HTMLMetaElement>('meta[property="og:image"], meta[property="og:image:secure_url"], meta[name="twitter:image"], meta[name="twitter:image:src"]')]
        .map((m) => brandImage(abs(m.content)))
        .concat(brandImage(abs(doc.querySelector<HTMLLinkElement>('link[rel="image_src"]')?.getAttribute('href')))),
    )].filter((u): u is string => !!u).slice(0, 6);
    const image = images[0];
    const declared = [...doc.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel~="apple-touch-icon"], link[rel~="apple-touch-icon-precomposed"], link[rel~="mask-icon"]')]
      .map((l) => abs(l.getAttribute('href')))
      .filter((u): u is string => !!u && !/\.svg(\?|$)/i.test(u));
    // Web-app manifests usually carry 192–512 px icons (Google Maps, Gmail, X…): the sharpest source there is.
    const manifestHref = abs(doc.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.getAttribute('href'));
    const fromManifest: string[] = [];
    if (manifestHref) {
      try {
        const m = await (await fetch(manifestHref, { credentials: 'omit', signal: AbortSignal.timeout(4000) })).json();
        for (const ic of (m.icons ?? []) as { src: string; sizes?: string; purpose?: string }[]) {
          if (ic.purpose && !/any/.test(ic.purpose)) continue; // skip maskable/monochrome-only art
          const u = new URL(ic.src, manifestHref).href;
          fromManifest.push(u);
        }
      } catch {
        /* no manifest */
      }
    }
    const svgs = [...doc.querySelectorAll<HTMLLinkElement>('link[rel~="icon"][href$=".svg"], link[rel~="icon"][type="image/svg+xml"]')]
      .map((l) => abs(l.getAttribute('href'))).filter((u): u is string => !!u);
    const finalOrigin = new URL(base).origin;
    const icons = await bestIcon([...fromManifest.reverse(), ...svgs, ...declared, ...WELL_KNOWN.map((p) => finalOrigin + p), ...known]);
    const title = (meta('meta[property="og:site_name"]') ?? doc.title)?.trim() || undefined;
    const imageData = image ? await localCopy(image) : undefined;
    return { image, imageData, images, ...icons, title };
  } catch {
    return await bestIcon(known);
  } finally {
    clearTimeout(timer);
  }
}

/** Fetched only with site access (granted at install). Cached per URL, kept until refreshed. */
export async function previewFor(url: string): Promise<Preview> {
  await cacheReady;
  const hit = mem.get(url);
  if (hit) return hit;
  if (!(await perm.has())) return {};
  let p = inflight.get(url);
  if (!p) {
    p = load(url).then((v) => {
      remember(url, v);
      inflight.delete(url);
      return v;
    });
    inflight.set(url, p);
  }
  return p;
}

export function forgetPreview(url?: string) {
  if (url) {
    for (const k of [url, `fav:${url}`]) { mem.delete(k); void tx('readwrite', (s) => s.delete(k)).catch(() => {}); }
    inflight.delete(url);
  } else {
    mem.clear();
    inflight.clear();
    void tx('readwrite', (s) => s.clear()).catch(() => {});
  }
}
