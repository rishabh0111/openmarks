// SPDX-License-Identifier: GPL-3.0-or-later
// Direct browser calls for menus, adding, sorting and permissions.
import type { DialFolder, DialItem } from '@openmarks/module-sdk';

export type Node = { id: string; parentId?: string; index?: number; title: string; url?: string; type?: string; children?: Node[] };
type Ev = { addListener(f: (...a: unknown[]) => void): void };
type Api = {
  bookmarks: {
    create(d: { parentId: string; title: string; url?: string; index?: number }): Promise<Node>;
    update(id: string, c: { title?: string; url?: string }): Promise<Node>;
    move(id: string, d: { parentId?: string; index?: number }): Promise<Node>;
    remove(id: string): Promise<void>;
    removeTree(id: string): Promise<void>;
    getChildren(id: string): Promise<Node[]>;
    getSubTree(id: string): Promise<Node[]>;
    getTree(): Promise<Node[]>;
    onCreated: Ev; onChanged: Ev; onMoved: Ev; onRemoved: Ev;
  };
  tabs: { create(d: { url: string; active?: boolean }): Promise<unknown>; query(q: { currentWindow?: boolean }): Promise<{ url?: string; title?: string }[]> };
  permissions: {
    contains(p: { origins: string[] }): Promise<boolean>;
    request(p: { origins: string[] }): Promise<boolean>;
    remove(p: { origins: string[] }): Promise<boolean>;
    onAdded: Ev; onRemoved: Ev;
  };
  runtime: { getURL(p: string): string };
};

const g = globalThis as unknown as { browser?: Api; chrome?: Api };
const api = (g.browser ?? g.chrome)!;
const ORIGINS = ['http://*/*', 'https://*/*'];

export const bm = {
  create: (parentId: string, title: string, url?: string, index?: number) =>
    api.bookmarks.create(index === undefined ? { parentId, title, url } : { parentId, title, url, index }),
  update: (id: string, title: string, url?: string) => api.bookmarks.update(id, url === undefined ? { title } : { title, url }),
  move: (id: string, parentId: string, index?: number) => api.bookmarks.move(id, index === undefined ? { parentId } : { parentId, index }),
  remove: (id: string, folder: boolean) => (folder ? api.bookmarks.removeTree(id) : api.bookmarks.remove(id)),
  children: (id: string) => api.bookmarks.getChildren(id),
  tree: () => api.bookmarks.getTree(),
  openTab: (url: string) => api.tabs.create({ url, active: false }),
  openTabsHere: () => api.tabs.query({ currentWindow: true }),
  onChange(f: () => void) {
    for (const e of [api.bookmarks.onCreated, api.bookmarks.onChanged, api.bookmarks.onMoved, api.bookmarks.onRemoved]) e.addListener(f);
  },
  /** Read any folder as a Dial folder (used when the user picks a different Dial folder). */
  async dialFrom(id: string): Promise<DialFolder> {
    const [root] = await api.bookmarks.getSubTree(id);
    if (!root) throw new Error('folder not found');
    const map = (n: Node): DialItem | null =>
      n.type === 'separator' ? null
      : n.url !== undefined ? { kind: 'link', id: n.id, title: n.title, url: n.url }
      : n.children ? { kind: 'folder', id: n.id, title: n.title, items: n.children.map(map).filter((x): x is DialItem => !!x) }
      : n.type === 'folder' ? { kind: 'folder', id: n.id, title: n.title, items: [] }
      : null;
    return { id: root.id, title: root.title, items: (root.children ?? []).map(map).filter((x): x is DialItem => !!x) };
  },
};

/** Site access for previews: optional, asked for only after the explainer. */
export const perm = {
  has: () => api.permissions.contains({ origins: ORIGINS }),
  request: () => api.permissions.request({ origins: ORIGINS }),
  drop: () => api.permissions.remove({ origins: ORIGINS }),
  onChange(f: () => void) {
    api.permissions.onAdded.addListener(f);
    api.permissions.onRemoved.addListener(f);
  },
};

/** The browser's own favicon (Chromium `favicon` permission); no network, no third party. Firefox has none. */
export function browserFavicon(url: string, size = 32): string | undefined {
  if (api.runtime.getURL('').startsWith('moz-extension:')) return undefined; // Firefox has no favicon API
  return api.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=${size}`);
}

const globes = new Map<number, Promise<string>>();
/** True when Chromium returned its generic globe (it has never seen this site's icon) → show a letter instead. */
export async function isGenericFavicon(b: Blob, size = 32): Promise<boolean> {
  const { fingerprint } = await import('./preview');
  if (!globes.has(size)) globes.set(size, fetch(browserFavicon('https://openmarks.invalid/', size)!).then((r) => r.blob()).then(fingerprint));
  return (await fingerprint(b)) === (await globes.get(size));
}

/** Compare URLs ignoring scheme, `www.`, trailing slash and fragment, for the duplicate warning. */
export function sameSite(a: string, b: string): boolean {
  const n = (u: string) => {
    try {
      const x = new URL(u);
      return (x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/$/, '') + x.search).toLowerCase();
    } catch {
      return u.trim().toLowerCase();
    }
  };
  return n(a) === n(b);
}

/** Accepts "example.com" or a full URL; never rewrites a URL that already has a scheme. */
export function toUrl(text: string): string | null {
  const t = text.trim();
  if (!t || /\s/.test(t)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) {
    try {
      return new URL(t).href;
    } catch {
      return null;
    }
  }
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(t)) return 'https://' + t;
  return null;
}
