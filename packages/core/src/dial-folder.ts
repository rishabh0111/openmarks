// SPDX-License-Identifier: MIT
import { DialLoadError, type DialFolder, type DialItem } from '@openmarks/module-sdk';
import type { BookmarkNode, BookmarksPort } from './bookmarks-port';

const DIAL_FOLDER_TITLE = 'Openmarks';
/** Other Bookmarks root ids when the browser doesn't report `folderType`: Chromium, Firefox. */
const OTHER_ROOT_IDS = ['2', 'unfiled_____'];

/** Finds or creates the Dial folder under `lock`, then returns its contents without separators. */
export async function loadDial(
  port: BookmarksPort,
  lock: <T>(fn: () => Promise<T>) => Promise<T>,
): Promise<DialFolder> {
  const folderId = await lock(() => findOrCreateDialFolder(port));
  const [folder] = await unavailableOnFailure(() => port.getSubTree(folderId));
  if (!folder) throw new DialLoadError('UNAVAILABLE');
  return { id: folder.id, title: folder.title, items: toItems(folder.children ?? []) };
}

async function findOrCreateDialFolder(port: BookmarksPort): Promise<string> {
  const [tree] = await unavailableOnFailure(() => port.getTree());
  const root = otherBookmarksRoot(tree?.children ?? []);
  if (!root) throw new DialLoadError('ROOT_NOT_FOUND');
  return unavailableOnFailure(async () => {
    const existing = (await port.getChildren(root.id))
      .filter((n) => n.url === undefined && n.title === DIAL_FOLDER_TITLE)
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))[0];
    return (existing ?? (await port.create({ parentId: root.id, title: DIAL_FOLDER_TITLE }))).id;
  });
}

function otherBookmarksRoot(roots: BookmarkNode[]): BookmarkNode | undefined {
  const others = roots.filter((n) => n.folderType === 'other');
  if (others.length > 0) return others.find((n) => n.syncing === true) ?? others[0];
  return roots.find((n) => OTHER_ROOT_IDS.includes(n.id));
}

function toItems(nodes: BookmarkNode[]): DialItem[] {
  return nodes.flatMap((n): DialItem[] => {
    if (n.type === 'separator') return [];
    if (n.url === undefined) return [{ kind: 'folder', id: n.id, title: n.title, items: toItems(n.children ?? []) }];
    return [{ kind: 'link', id: n.id, title: n.title, url: n.url }];
  });
}

async function unavailableOnFailure<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (cause) {
    throw new DialLoadError('UNAVAILABLE', { cause });
  }
}
