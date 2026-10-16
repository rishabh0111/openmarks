// SPDX-License-Identifier: MIT
// In-memory stand-in for the browser bookmarks API, shaped like Chrome's
// `chrome.bookmarks` (root "0", Bookmarks bar "1", Other bookmarks "2",
// Mobile bookmarks "3"). Test helper only.
import type { BookmarkNode, BookmarksPort } from '../bookmarks-port';

type Method = 'getTree' | 'getChildren' | 'getSubTree' | 'create';

/** A node as the browser stores it; `dateAdded` mirrors the real API. */
export type MemoryNode = BookmarkNode & { dateAdded?: number; children?: MemoryNode[] };

export interface MemoryBookmarks extends BookmarksPort {
  /** The next call to `method` rejects with `error` instead of running. */
  failNext(method: Method, error: Error): void;
  /** Number of calls made to each method, in total. */
  calls: Record<Method, number>;
}

/** Yields to the event loop so concurrent callers interleave like real async IPC. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const clone = <T>(value: T): T => structuredClone(value);

/** Strips `children` the way `chrome.bookmarks.getChildren` does. */
const shallow = ({ children: _children, ...rest }: MemoryNode): MemoryNode => clone(rest);

/**
 * Chrome's default tree: the three root folders, no bookmarks.
 * Pass `rootChildren` to replace the roots (for example to add a second
 * syncing "other" root, or to remove Other bookmarks entirely).
 */
export function chromeRoot(rootChildren?: MemoryNode[]): MemoryNode {
  return {
    id: '0',
    title: '',
    dateAdded: 1_700_000_000_000,
    syncing: false,
    children: rootChildren ?? [
      { id: '1', parentId: '0', index: 0, title: 'Bookmarks bar', folderType: 'bookmarks-bar', syncing: false, dateAdded: 1_700_000_000_000, children: [] },
      { id: '2', parentId: '0', index: 1, title: 'Other bookmarks', folderType: 'other', syncing: false, dateAdded: 1_700_000_000_000, children: [] },
      { id: '3', parentId: '0', index: 2, title: 'Mobile bookmarks', folderType: 'mobile', syncing: false, dateAdded: 1_700_000_000_000, children: [] },
    ],
  };
}

export function memoryBookmarks(root: MemoryNode = chromeRoot()): MemoryBookmarks {
  const tree = clone(root);
  const failures = new Map<Method, Error>();
  const calls: Record<Method, number> = { getTree: 0, getChildren: 0, getSubTree: 0, create: 0 };

  let nextId = 0;
  const walk = (node: MemoryNode, visit: (n: MemoryNode) => void) => {
    visit(node);
    node.children?.forEach((child) => walk(child, visit));
  };
  walk(tree, (n) => {
    nextId = Math.max(nextId, Number(n.id) || 0);
  });

  const find = (id: string): MemoryNode | undefined => {
    let found: MemoryNode | undefined;
    walk(tree, (n) => {
      if (n.id === id) found = n;
    });
    return found;
  };

  async function enter(method: Method): Promise<void> {
    calls[method] += 1;
    await tick();
    const failure = failures.get(method);
    if (failure) {
      failures.delete(method);
      throw failure;
    }
  }

  return {
    calls,
    failNext(method, error) {
      failures.set(method, error);
    },
    async getTree() {
      await enter('getTree');
      return [clone(tree)];
    },
    async getChildren(id) {
      await enter('getChildren');
      const node = find(id);
      if (!node) throw new Error("Can't find bookmark for id.");
      if (node.url !== undefined) throw new Error('Bookmark is not a folder.');
      return (node.children ?? []).map(shallow);
    },
    async getSubTree(id) {
      await enter('getSubTree');
      const node = find(id);
      if (!node) throw new Error("Can't find bookmark for id.");
      return [clone(node)];
    },
    async create({ parentId, title, url, index }) {
      await enter('create');
      const parent = find(parentId);
      if (!parent || parent.url !== undefined) throw new Error("Can't find parent bookmark for id.");
      parent.children ??= [];
      const at = index === undefined ? parent.children.length : Math.min(index, parent.children.length);
      nextId += 1;
      const node: MemoryNode = {
        id: String(nextId),
        parentId,
        index: at,
        title,
        syncing: parent.syncing ?? false,
        dateAdded: 1_700_000_000_000 + nextId,
        ...(url === undefined ? { children: [] } : { url }),
      };
      parent.children.splice(at, 0, node);
      parent.children.forEach((child, i) => {
        child.index = i;
      });
      return shallow(node);
    },
  };
}

/** A mutex shared by callers, standing in for `navigator.locks.request(name, fn)`. */
export function memoryLock(): <T>(fn: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn);
    tail = run.catch(() => undefined);
    return run;
  };
}
