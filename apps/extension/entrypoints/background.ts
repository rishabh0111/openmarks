// SPDX-License-Identifier: GPL-3.0-or-later
// "Add to Speed Dial" in the browser's right-click menu, on any web page
// (adds the page) and on any link (adds the link). It goes to the folder the dial shows, skips duplicates, and
// confirms with a small toast on the page.
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

async function add(url: string, title: string): Promise<'added' | 'exists'> {
  const folder = await dialFolderId();
  const all = await browser.bookmarks.getSubTree(folder);
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
function loaded(tabId: number, timeout = 15000): Promise<void> {
  return new Promise((ok) => {
    const done = () => { browser.tabs.onUpdated.removeListener(on); clearTimeout(t); ok(); };
    const on = (id: number, info: { status?: string }) => { if (id === tabId && info.status === 'complete') done(); };
    const t = setTimeout(done, timeout);
    browser.tabs.onUpdated.addListener(on);
  });
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
      await sleep(1500); // let late images and fonts settle
      try { await capture(win.id, url); n++; } catch { /* page refused or closed */ }
    }
  } finally {
    await browser.windows.remove(win.id).catch(() => {});
  }
  return n;
}

export default defineBackground(() => {
  browser.tabs.onUpdated.addListener(async (tabId, info, tab) => {
    if (info.status !== 'complete' || !tab.active || !tab.url || !/^https?:/.test(tab.url)) return;
    if (!(await wanted(tab.url))) return;
    const old = await getShot(tab.url);
    if (old && Date.now() - old.at < 6 * 3600e3) return;
    await sleep(1500);
    const now = await browser.tabs.get(tabId).catch(() => undefined);
    if (!now?.active || now.url !== tab.url) return;
    const win = await browser.windows.get(now.windowId);
    if (win.state === 'minimized') return;
    await capture(now.windowId, tab.url).catch(() => {});
  });
  browser.runtime.onMessage.addListener((msg: { type?: string; urls?: string[] }, _sender, reply) => {
    if (msg?.type !== 'capture' || !msg.urls?.length) return;
    captureMany(msg.urls).then((n) => reply({ n }));
    return true; // async reply
  });

  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.removeAll().then(() => {
      browser.contextMenus.create({ id: 'om-add-page', title: 'Add to Speed Dial', contexts: ['page'], documentUrlPatterns: WEB });
      browser.contextMenus.create({ id: 'om-add-link', title: 'Add link to Speed Dial', contexts: ['link'], targetUrlPatterns: WEB });
    });
  });
  const onClick = async (info: Parameters<Parameters<typeof browser.contextMenus.onClicked.addListener>[0]>[0], tab?: { id?: number; url?: string; title?: string }) => {
    const isLink = info.menuItemId === 'om-add-link';
    const url = isLink ? info.linkUrl : info.pageUrl ?? tab?.url;
    if (!url || !/^https?:/.test(url)) return;
    const title = isLink ? (await pageTitle(url)) || ((info as { linkText?: string }).linkText ?? '') : tab?.title ?? '';
    let msg: string;
    try {
      msg = (await add(url, title)) === 'added' ? 'Added to Speed Dial' : 'Already on your Speed Dial';
    } catch {
      msg = 'Couldn’t add to Speed Dial';
    }
    if (tab?.id !== undefined) browser.scripting.executeScript({ target: { tabId: tab.id }, func: toast, args: [msg] }).catch(() => {});
  };
  browser.contextMenus.onClicked.addListener((info, tab) => void onClick(info, tab));
});
