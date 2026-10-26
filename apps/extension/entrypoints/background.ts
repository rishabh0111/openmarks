// SPDX-License-Identifier: GPL-3.0-or-later
// "Openmarks ›" in the browser's right-click menu, on any web page (adds the page) and on any link (adds the link):
// "Add to Home" puts it on the dial's home, "Add to other folder ›" straight into one of the dial's folders. Skips
// duplicates, and confirms with a small toast on the page.
import { browser } from 'wxt/browser';
import { loadDial } from '@openmarks/core';
import { getShot, putShot, shotKey, tileShot } from '../../../modules/dial/src/shots';

const lock = <T,>(fn: () => Promise<T>) => navigator.locks.request('openmarks-dial-folder', fn) as Promise<T>;
const WEB = ['http://*/*', 'https://*/*'];

/** Same site and path, ignoring www., a trailing slash and the scheme. */
function key(u: string): string {
  try {
    const x = new URL(u);
    return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/$/, '') + x.search).toLowerCase();
  } catch {
    return u;
  }
}

async function dialFolderId(): Promise<string> {
  const { 'proto-dialFolder': id } = await browser.storage.local.get('proto-dialFolder');
  if (typeof id === 'string') {
    try {
      await browser.bookmarks.get(id);
      return id;
    } catch {
      /* folder gone: fall back to the default */
    }
  }
  return (await loadDial(browser.bookmarks, lock)).id;
}

/** The linked page's own title (link text is often "Learn more"); empty when it can't be read quickly. */
async function pageTitle(url: string): Promise<string> {
  try {
    const res = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(3000) });
    const head = (await res.text()).slice(0, 64 * 1024);
    const m = head.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i) ?? head.match(/<title[^>]*>([^<]+)<\/title>/i);
    return m ? m[1]!.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim() : '';
  } catch {
    return '';
  }
}

async function add(url: string, title: string, folder: string): Promise<'added' | 'exists'> {
  const all = await browser.bookmarks.getSubTree(await dialFolderId());
  const seen = (n: { url?: string; children?: unknown[] }): boolean =>
    (n.url !== undefined && key(n.url) === key(url)) || ((n.children ?? []) as { url?: string; children?: unknown[] }[]).some(seen);
  if (all[0] && seen(all[0])) return 'exists';
  await browser.bookmarks.create({ parentId: folder, title: title.trim() || new URL(url).hostname.replace(/^www\./, ''), url });
  return 'added';
}

/** A small, self-contained confirmation on the page (shadow DOM, removes itself). */
function toast(text: string) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;z-index:2147483647;right:20px;bottom:20px;pointer-events:none';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<div style="font:500 13px/1.3 system-ui,sans-serif;color:#f5f6f8;background:#1f2328;padding:10px 14px;border-radius:999px;box-shadow:0 8px 24px rgb(0 0 0 / .3);display:flex;gap:8px;align-items:center;opacity:0;transform:translateY(6px);transition:opacity .18s,transform .18s"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7ee2a8" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg><span></span></div>`;
  const pill = root.firstElementChild as HTMLElement;
  pill.querySelector('span')!.textContent = text;
  document.documentElement.append(host);
  requestAnimationFrame(() => { pill.style.opacity = '1'; pill.style.transform = 'none'; });
  setTimeout(() => { pill.style.opacity = '0'; setTimeout(() => host.remove(), 250); }, 2200);
}

// ── Right-click menus ─────────────────────────────────────────────────────────
// Menu ids: om-add:<ctx> adds to the dial's home; om-to:<ctx>:<folder id> adds to that folder. The folder list follows
// the bookmarks, so it's rebuilt (debounced, one rebuild at a time) whenever they or the dial folder change.
const CONTEXTS = [['page', 'documentUrlPatterns', ''], ['link', 'targetUrlPatterns', 'link ']] as const;
let building: Promise<void> = Promise.resolve();
async function buildMenus() {
  await browser.contextMenus.removeAll();
  const home = await dialFolderId().catch(() => undefined);
  const folders = home ? (await browser.bookmarks.getChildren(home)).filter((n) => n.url === undefined && (n as { type?: string }).type !== 'separator') : [];
  // "&" marks a keyboard shortcut in menu titles; "&&" is a literal one.
  const label = (t: string) => t.trim().toLocaleUpperCase().replace(/&/g, '&&');
  // One "Openmarks" item (a single top-level item: the browser shows it as is, not grouped under the extension's name):
  //   Openmarks › Add to Home · Add to other folder › WORK, READING…
  for (const [ctx, patterns, what] of CONTEXTS) {
    const top = `om:${ctx}`;
    browser.contextMenus.create({ id: top, title: 'Openmarks', contexts: [ctx], [patterns]: WEB });
    browser.contextMenus.create({ id: `om-add:${ctx}`, parentId: top, title: `Add ${what}to Home`, contexts: [ctx] });
    if (!home || !folders.length) continue;
    const parentId = `om-to:${ctx}`;
    browser.contextMenus.create({ id: parentId, parentId: top, title: `Add ${what}to other folder`, contexts: [ctx] });
    for (const f of folders) browser.contextMenus.create({ id: `${parentId}:${f.id}`, parentId, title: label(f.title), contexts: [ctx] });
  }
}
let menuTimer: ReturnType<typeof setTimeout> | undefined;
function rebuildMenus(delay = 400) {
  clearTimeout(menuTimer);
  menuTimer = setTimeout(() => (building = building.then(buildMenus).catch(() => {})), delay);
}

// ── Screenshots (Screenshot pictures) ─────────────────────────────────────────
// 1. On visit: when a page that wants a screenshot finishes loading in the tab you're looking at, capture what you
//    see (at most every 6 hours per site). Nothing opens, nothing flashes.
// 2. On request (Edit → Screenshot → Take screenshot, or Settings → Capture all): the pages load in a small popup
//    window for a moment, one after another, each captured once it settles, then the window closes.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function shotWidth(): Promise<number> {
  const { 'proto-density': d } = await browser.storage.local.get('proto-density');
  return Math.min(1600, Math.round(420 * (typeof d === 'number' ? d : 1)));
}
async function wanted(url: string): Promise<boolean> {
  const { 'proto-shot-urls': list } = await browser.storage.local.get('proto-shot-urls');
  return Array.isArray(list) && list.some((u: string) => shotKey(u) === shotKey(url));
}
async function capture(windowId: number, url: string) {
  const data = await browser.tabs.captureVisibleTab(windowId, { format: 'png' });
  await putShot(url, await tileShot(await (await fetch(data)).blob(), await shotWidth()));
}
/** Resolves once the tab has started loading a real page (not the about:blank it opened on) and finished it. A
 *  "complete" from before the navigation (the blank page, the previous site) doesn't count. */
function loaded(tabId: number, timeout = 20000): Promise<void> {
  return new Promise((ok) => {
    let started = false;
    const done = () => { browser.tabs.onUpdated.removeListener(on); clearTimeout(t); ok(); };
    const on = (id: number, info: { status?: string; url?: string }, tab: { url?: string }) => {
      if (id !== tabId) return;
      const real = !!tab.url && tab.url !== 'about:blank';
      if (info.status === 'loading' && real) started = true;
      else if (info.status === 'complete' && started && real) done();
    };
    const t = setTimeout(done, timeout);
    browser.tabs.onUpdated.addListener(on);
  });
}
/** Runs in the page: waits until it looks finished. The load event, web fonts, the pictures in view, then a moment
 *  without changes to the page (sites that draw themselves after loading), at most 8 s. Returns how far it's scrolled. */
async function settle(): Promise<number> {
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const until = Date.now() + 8000;
  if (document.readyState !== 'complete') await Promise.race([new Promise((r) => addEventListener('load', r, { once: true })), wait(6000)]);
  await Promise.race([document.fonts?.ready, wait(3000)]);
  const inView = [...document.images].filter((i) => { const r = i.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight; });
  await Promise.race([Promise.all(inView.map((i) => (i.complete ? 0 : i.decode().catch(() => 0)))), wait(4000)]);
  await new Promise<void>((r) => {
    let t = setTimeout(fin, 700);
    const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(fin, 700); });
    const cap = setTimeout(fin, Math.max(0, until - Date.now()));
    function fin() { mo.disconnect(); clearTimeout(t); clearTimeout(cap); r(); }
    mo.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return scrollY;
}
/** Waits in the tab for the page to settle; pages that can't be scripted (store pages) get a fixed pause. */
async function settled(tabId: number): Promise<number> {
  try {
    const [r] = await browser.scripting.executeScript({ target: { tabId }, func: settle });
    return typeof r?.result === 'number' ? r.result : 0;
  } catch {
    await sleep(2500);
    return 0;
  }
}
async function captureMany(urls: string[]): Promise<number> {
  const win = await browser.windows.create({ url: 'about:blank', type: 'popup', width: 1280, height: 860, focused: true });
  if (!win?.id || !win.tabs?.[0]?.id) return 0;
  const tabId = win.tabs[0].id;
  let n = 0;
  try {
    for (const url of urls) {
      const wait = loaded(tabId);
      await browser.tabs.update(tabId, { url });
      await wait;
      await settled(tabId);
      try { await capture(win.id, url); n++; } catch { /* page refused or closed */ }
    }
  } finally {
    await browser.windows.remove(win.id).catch(() => {});
  }
  return n;
}

// ── Private windows (Firefox) ─────────────────────────────────────────────────
// The new tab in a private window gets its own, empty storage, so it asks here (the normal side) for the saved
// settings, cached pictures and screenshots instead of fetching everything again (modules/dial/src/private.ts).
type NormalAsk = { type: 'om-normal'; local?: boolean; db?: string; store?: string; key?: string };
type NormalPut = { type: 'om-put'; db?: string; store?: string; key: string; value: unknown };
/** Opens an existing database without creating it (or its stores) when it isn't there. */
function openExisting(name: string): Promise<IDBDatabase | null> {
  return new Promise((ok) => {
    const r = indexedDB.open(name);
    r.onupgradeneeded = () => r.transaction?.abort();
    r.onerror = () => ok(null);
    r.onsuccess = () => ok(r.result);
  });
}
async function readStore(name: string, store: string, key?: string): Promise<[IDBValidKey, unknown][]> {
  const d = await openExisting(name);
  if (!d) return [];
  if (!d.objectStoreNames.contains(store)) return (d.close(), []);
  return new Promise((ok) => {
    const out: [IDBValidKey, unknown][] = [];
    const s = d.transaction(store).objectStore(store);
    const finish = () => { d.close(); ok(out); };
    if (key !== undefined) {
      const g = s.get(key);
      g.onsuccess = () => { if (g.result !== undefined) out.push([key, g.result]); finish(); };
      g.onerror = finish;
      return;
    }
    const c = s.openCursor();
    c.onsuccess = () => { const x = c.result; if (!x) return finish(); out.push([x.key, x.value]); x.continue(); };
    c.onerror = finish;
  });
}
async function writeStore(name: string, store: string, key: string, value: unknown) {
  const d = await openExisting(name);
  if (!d) return;
  if (d.objectStoreNames.contains(store)) d.transaction(store, 'readwrite').objectStore(store).put(value, key);
  d.close();
}
async function normal(msg: NormalAsk) {
  // A Chromium service worker has no localStorage (and Chromium never shows Openmarks in incognito anyway).
  const local: Record<string, string> = {};
  if (msg.local && typeof localStorage !== 'undefined')
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; local[k] = localStorage.getItem(k)!; }
  return { local, entries: msg.db && msg.store ? await readStore(msg.db, msg.store, msg.key) : [] };
}

// ── Focus the dial on new tabs (Settings › Page, on by default) ───────────────
// A browser puts a new tab's focus in its address bar, where "/" or typing would land, and nothing a page does, not
// even loading itself again, takes it back. A tab the extension opens does get the focus. So when you open a new tab
// (or a new window, or Firefox starts on the dial), as soon as it starts loading the dial a fresh tab with the dial
// takes its place: same window, position, container and opener, with an empty address bar. As soon as possible, so
// the swap is barely seen. Done here and not in the page, which Firefox may have loaded ahead of time.
const NEWTAB = () => browser.runtime.getURL('/newtab.html');
const opening = new Set<number>(); // new tabs opened in front, waiting for the dial to load
let ours = 0; // replacement tabs being opened right now (not to be replaced themselves)
async function focusDial(tabId: number) {
  opening.delete(tabId);
  const { 'proto-focusPage': on } = await browser.storage.local.get('proto-focusPage');
  if (on === false) return;
  const tab = await browser.tabs.get(tabId).catch(() => undefined);
  if (!tab?.active) return; // moved on
  ours++;
  try {
    const t = tab as typeof tab & { cookieStoreId?: string; openerTabId?: number };
    await browser.tabs.create({
      url: NEWTAB(), windowId: tab.windowId, index: tab.index, active: true,
      ...(t.openerTabId !== undefined ? { openerTabId: t.openerTabId } : {}),
      ...(t.cookieStoreId && t.cookieStoreId !== 'firefox-default' ? { cookieStoreId: t.cookieStoreId } : {}),
    } as Parameters<typeof browser.tabs.create>[0]);
    await browser.tabs.remove(tabId);
  } catch {
    /* the tab went away meanwhile */
  } finally {
    ours--;
  }
}

export default defineBackground(() => {
  // A new tab in front: the dial when it already has it (loaded ahead of time), else once it starts loading the dial.
  // A tab that starts loading something else (a link opened in a new tab) is left alone.
  const blank = (u: string) => u === 'about:blank' || u === 'about:newtab' || u === 'about:home' || u === 'chrome://newtab/';
  const watch = (tab: { id?: number; active: boolean; url?: string }) => {
    if (!tab.active || tab.id === undefined || ours > 0) return;
    const url = tab.url ?? (tab as { pendingUrl?: string }).pendingUrl ?? '';
    if (url === NEWTAB()) void focusDial(tab.id);
    else if (blank(url)) opening.add(tab.id);
  };
  browser.tabs.onCreated.addListener(watch);
  browser.tabs.onUpdated.addListener((tabId, info) => {
    if (!opening.has(tabId) || !info.url) return;
    if (info.url === NEWTAB()) void focusDial(tabId);
    else if (!blank(info.url)) opening.delete(tabId); // went to a site instead
  });
  browser.tabs.onRemoved.addListener((tabId) => opening.delete(tabId));
  // Firefox starting on the dial (it's the homepage): that tab was opened before this script ran.
  browser.runtime.onStartup.addListener(() => {
    void browser.tabs.query({ active: true }).then((tabs) => tabs.forEach(watch));
  });

  browser.tabs.onUpdated.addListener(async (tabId, info, tab) => {
    if (info.status !== 'complete' || !tab.active || !tab.url || !/^https?:/.test(tab.url)) return;
    if (!(await wanted(tab.url))) return;
    const old = await getShot(tab.url);
    if (old && Date.now() - old.at < 6 * 3600e3) return;
    const scrolled = await settled(tabId);
    const now = await browser.tabs.get(tabId).catch(() => undefined);
    if (!now?.active || now.url !== tab.url || scrolled > 0) return; // moved on, or scrolled away from the top
    const win = await browser.windows.get(now.windowId);
    if (win.state === 'minimized') return;
    await capture(now.windowId, tab.url).catch(() => {});
  });
  browser.runtime.onMessage.addListener((msg: { type?: string; urls?: string[] } & Partial<NormalAsk> & Partial<NormalPut>, _sender, reply) => {
    if (msg?.type === 'capture' && msg.urls?.length) {
      captureMany(msg.urls).then((n) => reply({ n }));
      return true; // async reply
    }
    if (msg?.type === 'om-normal') {
      normal(msg as NormalAsk).then(reply, () => reply({ local: {}, entries: [] }));
      return true;
    }
    if (msg?.type === 'om-put' && msg.key !== undefined) {
      if (msg.db && msg.store) void writeStore(msg.db, msg.store, msg.key, msg.value).catch(() => {});
      else if (typeof localStorage !== 'undefined' && typeof msg.value === 'string') try { localStorage.setItem(msg.key, msg.value); } catch { /* full */ }
    }
  });

  browser.runtime.onInstalled.addListener(() => rebuildMenus(0));
  browser.runtime.onStartup.addListener(() => rebuildMenus(0));
  for (const e of [browser.bookmarks.onCreated, browser.bookmarks.onRemoved, browser.bookmarks.onChanged, browser.bookmarks.onMoved]) e.addListener(() => rebuildMenus());
  browser.storage.onChanged.addListener((c) => { if ('proto-dialFolder' in c) rebuildMenus(); });

  const onClick = async (info: Parameters<Parameters<typeof browser.contextMenus.onClicked.addListener>[0]>[0], tab?: { id?: number; url?: string; title?: string }) => {
    const [kind, ctx, folder] = String(info.menuItemId).split(':');
    if (kind !== 'om-add' && kind !== 'om-to') return;
    const isLink = ctx === 'link';
    const url = isLink ? info.linkUrl : info.pageUrl ?? tab?.url;
    if (!url || !/^https?:/.test(url)) return;
    const title = isLink ? (await pageTitle(url)) || ((info as { linkText?: string }).linkText ?? '') : tab?.title ?? '';
    let msg: string;
    try {
      const home = await dialFolderId();
      const to = kind === 'om-to' && folder ? folder : home;
      const where = to === home ? 'Openmarks Home' : (await browser.bookmarks.get(to))[0]?.title.toLocaleUpperCase() ?? 'Openmarks';
      msg = (await add(url, title, to)) === 'added' ? `Added to ${where}` : 'Already on Openmarks';
    } catch {
      msg = 'Couldn’t add to Openmarks';
    }
    if (tab?.id !== undefined) browser.scripting.executeScript({ target: { tabId: tab.id }, func: toast, args: [msg] }).catch(() => {});
  };
  browser.contextMenus.onClicked.addListener((info, tab) => void onClick(info, tab));
});
