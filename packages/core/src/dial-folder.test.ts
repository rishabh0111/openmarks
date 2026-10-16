// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';
import { DialLoadError } from '@openmarks/module-sdk';
import { loadDial } from './dial-folder';
import { chromeRoot, memoryBookmarks, memoryLock, type MemoryNode } from './test/memory-bookmarks';

const T = 1_700_000_000_000;

/** Other bookmarks holding a News bookmark and an "Openmarks" Dial folder with mixed contents. */
function treeWithDialFolder(): MemoryNode {
  return chromeRoot([
    { id: '1', parentId: '0', index: 0, title: 'Bookmarks bar', folderType: 'bookmarks-bar', syncing: false, dateAdded: T, children: [] },
    {
      id: '2', parentId: '0', index: 1, title: 'Other bookmarks', folderType: 'other', syncing: false, dateAdded: T,
      children: [
        { id: '10', parentId: '2', index: 0, title: 'News', url: 'https://news.test/', syncing: false, dateAdded: T },
        {
          id: '11', parentId: '2', index: 1, title: 'Openmarks', syncing: false, dateAdded: T,
          children: [
            { id: '12', parentId: '11', index: 0, title: 'Alpha', url: 'https://a.test/', syncing: false, dateAdded: T },
            { id: '13', parentId: '11', index: 1, title: '', url: 'data:', type: 'separator', syncing: false, dateAdded: T },
            {
              id: '14', parentId: '11', index: 2, title: 'Work', syncing: false, dateAdded: T,
              children: [
                { id: '15', parentId: '14', index: 0, title: 'Docs', url: 'https://docs.test/', syncing: false, dateAdded: T },
                {
                  id: '16', parentId: '14', index: 1, title: 'Deep', syncing: false, dateAdded: T,
                  children: [{ id: '17', parentId: '16', index: 0, title: 'Wiki', url: 'https://wiki.test/', syncing: false, dateAdded: T }],
                },
                { id: '18', parentId: '14', index: 2, title: '', url: 'data:', type: 'separator', syncing: false, dateAdded: T },
              ],
            },
            { id: '19', parentId: '11', index: 3, title: 'Beta', url: 'https://b.test/', syncing: false, dateAdded: T },
          ],
        },
      ],
    },
    { id: '3', parentId: '0', index: 2, title: 'Mobile bookmarks', folderType: 'mobile', syncing: false, dateAdded: T, children: [] },
  ]);
}

/** Folders titled "Openmarks" directly under the given folder, read back through the port. */
async function openmarksFoldersIn(port: ReturnType<typeof memoryBookmarks>, parentId: string) {
  const children = await port.getChildren(parentId);
  return children.filter((n) => n.url === undefined && n.title === 'Openmarks').map((n) => n.id);
}

describe('loadDial', () => {
  it('creates the Openmarks folder once', async () => {
    const port = memoryBookmarks(chromeRoot());
    const lock = memoryLock();

    const first = await loadDial(port, lock);
    const second = await loadDial(port, lock);

    expect(first).toEqual({ id: '4', title: 'Openmarks', items: [] });
    expect(second).toEqual({ id: '4', title: 'Openmarks', items: [] });
    expect(await openmarksFoldersIn(port, '2')).toEqual(['4']);
  });

  it('concurrent loads create one folder', async () => {
    const port = memoryBookmarks(chromeRoot());
    const lock = memoryLock();

    const [a, b] = await Promise.all([loadDial(port, lock), loadDial(port, lock)]);

    expect(await openmarksFoldersIn(port, '2')).toEqual(['4']);
    expect(a.id).toBe('4');
    expect(b.id).toBe('4');
  });

  it('returns the Dial folder in bookmark order with separators removed', async () => {
    const port = memoryBookmarks(treeWithDialFolder());

    const dial = await loadDial(port, memoryLock());

    expect(dial).toEqual({
      id: '11',
      title: 'Openmarks',
      items: [
        { kind: 'link', id: '12', title: 'Alpha', url: 'https://a.test/' },
        {
          kind: 'folder', id: '14', title: 'Work',
          items: [
            { kind: 'link', id: '15', title: 'Docs', url: 'https://docs.test/' },
            { kind: 'folder', id: '16', title: 'Deep', items: [{ kind: 'link', id: '17', title: 'Wiki', url: 'https://wiki.test/' }] },
          ],
        },
        { kind: 'link', id: '19', title: 'Beta', url: 'https://b.test/' },
      ],
    });
  });

  it('ignores a bookmark titled Openmarks and creates the folder', async () => {
    const port = memoryBookmarks(
      chromeRoot([
        { id: '1', parentId: '0', index: 0, title: 'Bookmarks bar', folderType: 'bookmarks-bar', syncing: false, dateAdded: T, children: [] },
        {
          id: '2', parentId: '0', index: 1, title: 'Other bookmarks', folderType: 'other', syncing: false, dateAdded: T,
          children: [{ id: '4', parentId: '2', index: 0, title: 'Openmarks', url: 'https://openmarks.test/', syncing: false, dateAdded: T }],
        },
        { id: '3', parentId: '0', index: 2, title: 'Mobile bookmarks', folderType: 'mobile', syncing: false, dateAdded: T, children: [] },
      ]),
    );

    const dial = await loadDial(port, memoryLock());

    expect(dial).toEqual({ id: '5', title: 'Openmarks', items: [] });
    expect(await openmarksFoldersIn(port, '2')).toEqual(['5']);
  });

  it('uses the lower-index folder when two Openmarks folders exist', async () => {
    // The lower-index folder deliberately has the higher id, so "lowest id" and "last found" both fail.
    const port = memoryBookmarks(
      chromeRoot([
        { id: '1', parentId: '0', index: 0, title: 'Bookmarks bar', folderType: 'bookmarks-bar', syncing: false, dateAdded: T, children: [] },
        {
          id: '2', parentId: '0', index: 1, title: 'Other bookmarks', folderType: 'other', syncing: false, dateAdded: T,
          children: [
            {
              id: '5', parentId: '2', index: 0, title: 'Openmarks', syncing: false, dateAdded: T,
              children: [{ id: '6', parentId: '5', index: 0, title: 'First', url: 'https://first.test/', syncing: false, dateAdded: T }],
            },
            {
              id: '4', parentId: '2', index: 1, title: 'Openmarks', syncing: false, dateAdded: T,
              children: [{ id: '7', parentId: '4', index: 0, title: 'Second', url: 'https://second.test/', syncing: false, dateAdded: T }],
            },
          ],
        },
        { id: '3', parentId: '0', index: 2, title: 'Mobile bookmarks', folderType: 'mobile', syncing: false, dateAdded: T, children: [] },
      ]),
    );

    const dial = await loadDial(port, memoryLock());

    expect(dial).toEqual({
      id: '5',
      title: 'Openmarks',
      items: [{ kind: 'link', id: '6', title: 'First', url: 'https://first.test/' }],
    });
  });

  describe('with local and syncing (account) roots', () => {
    const roots = (localOther: MemoryNode[], syncingOther: MemoryNode[]): MemoryNode =>
      chromeRoot([
        { id: '1', parentId: '0', index: 0, title: 'Bookmarks bar', folderType: 'bookmarks-bar', syncing: false, dateAdded: T, children: [] },
        { id: '2', parentId: '0', index: 1, title: 'Other bookmarks', folderType: 'other', syncing: false, dateAdded: T, children: localOther },
        { id: '3', parentId: '0', index: 2, title: 'Mobile bookmarks', folderType: 'mobile', syncing: false, dateAdded: T, children: [] },
        { id: '4', parentId: '0', index: 3, title: 'Bookmarks bar', folderType: 'bookmarks-bar', syncing: true, dateAdded: T, children: [] },
        { id: '5', parentId: '0', index: 4, title: 'Other bookmarks', folderType: 'other', syncing: true, dateAdded: T, children: syncingOther },
        { id: '6', parentId: '0', index: 5, title: 'Mobile bookmarks', folderType: 'mobile', syncing: true, dateAdded: T, children: [] },
      ]);

    it('creates the Openmarks folder under the syncing Other bookmarks', async () => {
      const port = memoryBookmarks(roots([], []));

      const dial = await loadDial(port, memoryLock());

      expect(dial).toEqual({ id: '7', title: 'Openmarks', items: [] });
      expect(await openmarksFoldersIn(port, '5')).toEqual(['7']);
      expect(await openmarksFoldersIn(port, '2')).toEqual([]);
    });

    it('finds the Openmarks folder under the syncing Other bookmarks', async () => {
      const port = memoryBookmarks(
        roots(
          [{ id: '10', parentId: '2', index: 0, title: 'Openmarks', syncing: false, dateAdded: T, children: [] }],
          [
            {
              id: '11', parentId: '5', index: 0, title: 'Openmarks', syncing: true, dateAdded: T,
              children: [{ id: '12', parentId: '11', index: 0, title: 'Synced', url: 'https://synced.test/', syncing: true, dateAdded: T }],
            },
          ],
        ),
      );

      const dial = await loadDial(port, memoryLock());

      expect(dial).toEqual({
        id: '11',
        title: 'Openmarks',
        items: [{ kind: 'link', id: '12', title: 'Synced', url: 'https://synced.test/' }],
      });
    });
  });

  describe('when the browser reports no folderType', () => {
    /** Firefox's roots: fixed GUID ids and no `folderType`. */
    const firefoxRoot = (unfiled: MemoryNode[] = []): MemoryNode =>
      chromeRoot([
        { id: 'menu________', parentId: '0', index: 0, title: 'Bookmarks Menu', dateAdded: T, children: [] },
        { id: 'toolbar_____', parentId: '0', index: 1, title: 'Bookmarks Toolbar', dateAdded: T, children: [] },
        { id: 'unfiled_____', parentId: '0', index: 2, title: 'Other Bookmarks', dateAdded: T, children: unfiled },
        { id: 'mobile______', parentId: '0', index: 3, title: 'Mobile Bookmarks', dateAdded: T, children: [] },
      ]);

    it('creates the Openmarks folder under Firefox unfiled_____', async () => {
      const port = memoryBookmarks(firefoxRoot());

      const dial = await loadDial(port, memoryLock());

      expect(dial).toEqual({ id: '1', title: 'Openmarks', items: [] });
      expect(await openmarksFoldersIn(port, 'unfiled_____')).toEqual(['1']);
      expect(await openmarksFoldersIn(port, 'menu________')).toEqual([]);
      expect(await openmarksFoldersIn(port, 'toolbar_____')).toEqual([]);
      expect(await openmarksFoldersIn(port, 'mobile______')).toEqual([]);
    });

    it('finds the Openmarks folder under Firefox unfiled_____', async () => {
      const port = memoryBookmarks(
        firefoxRoot([
          {
            id: 'abc', parentId: 'unfiled_____', index: 0, title: 'Openmarks', dateAdded: T,
            children: [{ id: 'def', parentId: 'abc', index: 0, title: 'Fox', url: 'https://fox.test/', dateAdded: T }],
          },
        ]),
      );

      const dial = await loadDial(port, memoryLock());

      expect(dial).toEqual({ id: 'abc', title: 'Openmarks', items: [{ kind: 'link', id: 'def', title: 'Fox', url: 'https://fox.test/' }] });
      expect(port.calls.create).toBe(0);
    });

    it('uses Chromium root 2 as Other bookmarks', async () => {
      const port = memoryBookmarks(
        chromeRoot([
          { id: '1', parentId: '0', index: 0, title: 'Bookmarks bar', dateAdded: T, children: [] },
          { id: '2', parentId: '0', index: 1, title: 'Other bookmarks', dateAdded: T, children: [] },
          { id: '3', parentId: '0', index: 2, title: 'Mobile bookmarks', dateAdded: T, children: [] },
        ]),
      );

      const dial = await loadDial(port, memoryLock());

      expect(dial.id).toBe('4');
      expect(await openmarksFoldersIn(port, '2')).toEqual(['4']);
    });
  });

  it('does not use a root with id 2 when folderType says it is not Other bookmarks', async () => {
    const port = memoryBookmarks(
      chromeRoot([
        { id: '1', parentId: '0', index: 0, title: 'Bookmarks bar', folderType: 'bookmarks-bar', syncing: false, dateAdded: T, children: [] },
        { id: '2', parentId: '0', index: 1, title: 'Mobile bookmarks', folderType: 'mobile', syncing: false, dateAdded: T, children: [] },
        { id: '3', parentId: '0', index: 2, title: 'Other bookmarks', folderType: 'other', syncing: false, dateAdded: T, children: [] },
      ]),
    );

    const dial = await loadDial(port, memoryLock());

    expect(await openmarksFoldersIn(port, '3')).toEqual([dial.id]);
    expect(await openmarksFoldersIn(port, '2')).toEqual([]);
  });

  it('rejects with ROOT_NOT_FOUND when there is no Other bookmarks root', async () => {
    const port = memoryBookmarks(
      chromeRoot([
        { id: '1', parentId: '0', index: 0, title: 'Bookmarks bar', folderType: 'bookmarks-bar', syncing: false, dateAdded: T, children: [] },
        { id: '3', parentId: '0', index: 1, title: 'Mobile bookmarks', folderType: 'mobile', syncing: false, dateAdded: T, children: [] },
      ]),
    );

    const result = loadDial(port, memoryLock());

    await expect(result).rejects.toBeInstanceOf(DialLoadError);
    await expect(result).rejects.toMatchObject({ code: 'ROOT_NOT_FOUND' });
    expect(port.calls.create).toBe(0);
  });

  describe.each([
    { method: 'getTree' as const, tree: treeWithDialFolder },
    { method: 'getSubTree' as const, tree: treeWithDialFolder },
    { method: 'create' as const, tree: () => chromeRoot() },
  ])('when $method fails', ({ method, tree }) => {
    it('rejects with UNAVAILABLE and the original error as cause', async () => {
      const port = memoryBookmarks(tree());
      const cause = new Error(`${method} exploded`);
      port.failNext(method, cause);

      const result = loadDial(port, memoryLock());

      await expect(result).rejects.toBeInstanceOf(DialLoadError);
      await expect(result).rejects.toMatchObject({ code: 'UNAVAILABLE', cause });
    });

    it('the next call retries and succeeds', async () => {
      const port = memoryBookmarks(tree());
      const lock = memoryLock();
      port.failNext(method, new Error(`${method} exploded`));

      await loadDial(port, lock).catch(() => undefined);
      const dial = await loadDial(port, lock);

      const expectedId = method === 'create' ? '4' : '11';
      expect(dial.id).toBe(expectedId);
      expect(await openmarksFoldersIn(port, '2')).toEqual([expectedId]);
    });
  });

  it('leaves bookmarks outside the Dial folder untouched', async () => {
    const seeded = (): MemoryNode =>
      chromeRoot([
        {
          id: '1', parentId: '0', index: 0, title: 'Bookmarks bar', folderType: 'bookmarks-bar', syncing: false, dateAdded: T,
          children: [
            { id: '10', parentId: '1', index: 0, title: 'Mail', url: 'https://mail.test/', syncing: false, dateAdded: T },
            {
              id: '11', parentId: '1', index: 1, title: 'Reading', syncing: false, dateAdded: T,
              children: [{ id: '12', parentId: '11', index: 0, title: 'Essay', url: 'https://essay.test/', syncing: false, dateAdded: T }],
            },
          ],
        },
        {
          id: '2', parentId: '0', index: 1, title: 'Other bookmarks', folderType: 'other', syncing: false, dateAdded: T,
          children: [{ id: '13', parentId: '2', index: 0, title: 'Recipes', url: 'https://recipes.test/', syncing: false, dateAdded: T }],
        },
        { id: '3', parentId: '0', index: 2, title: 'Mobile bookmarks', folderType: 'mobile', syncing: false, dateAdded: T, children: [] },
      ]);
    const port = memoryBookmarks(seeded());

    const dial = await loadDial(port, memoryLock());

    const [after] = await port.getTree();
    const other = after.children!.find((n) => n.id === '2')!;
    other.children = other.children!.filter((n) => n.id !== dial.id);
    expect(after).toEqual(seeded());
  });
});
