// SPDX-License-Identifier: MIT
// The slice of the browser bookmarks API the core uses; `browser.bookmarks` satisfies it.

export type BookmarkNode = {
  id: string;
  parentId?: string;
  title: string;
  url?: string;
  index?: number;
  type?: 'bookmark' | 'folder' | 'separator';
  folderType?: string;
  syncing?: boolean;
  children?: BookmarkNode[];
};

export interface BookmarksPort {
  getTree(): Promise<BookmarkNode[]>;
  getChildren(id: string): Promise<BookmarkNode[]>;
  getSubTree(id: string): Promise<BookmarkNode[]>;
  create(d: { parentId: string; title: string; url?: string; index?: number }): Promise<BookmarkNode>;
}
