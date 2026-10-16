<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- The Dial page. Sane defaults, few choices:
     one top bar: folder names (scroll sideways when many) · a small search pill that expands on click or "/" · clock; settings in the bottom-right corner;
     Vivaldi cards; a small round "+" to add; menus with icons; settings as a visual sheet from the bottom. -->
<script lang="ts">
  import type { DialFolder, DialItem } from '@openmarks/module-sdk';
  import { tabsFrom, host, folderName } from './shared';
  import { prefs, epoch, fixed, savePrefs } from './prefs.svelte';
  import { copyPicture, pictures } from './pictures.svelte';
  import { wantShots, requestShots } from './shots.svelte';
  import { bm, perm, sameSite, toUrl, webSearch } from './bm';
  import { previewFor, forgetPreview } from './preview';
  import { saveWallpaper, loadWallpaper, dailyWallpaper, peekDaily, readSnap, makeSnap, dropSnap, saveBoot, type Daily } from './wallpaper';
  import { icons } from './icons';
  import { themeById, themeVars, isDark, prominent, accentFrom, onAccent } from './themes';
  import SettingsSheet from './SettingsSheet.svelte';
  import KeysHelp from './KeysHelp.svelte';
  import { watchGamepads, type PadAction } from './gamepad';
  import Card from './Card.svelte';
  import { tick } from 'svelte';
  import Menu, { type MenuItem } from './Menu.svelte';
  import EditDialog from './EditDialog.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import NameDialog from './NameDialog.svelte';
  import FolderPicker from './FolderPicker.svelte';

  let { dial, reload }: { dial: DialFolder; reload: () => void } = $props();
  bm.onChange(() => reload());

  type Folder = Extract<DialItem, { kind: 'folder' }>;
  const tabs = $derived(tabsFrom(dial));
  let selected = $state(localStorage.getItem('proto-tab') ?? 'home');
  let crumbIds = $state<string[]>([]);
  let sheet = $state(false);
  let query = $state('');
  let active = $state(0);
  let searchEl = $state<HTMLInputElement>();
  let searchOpen = $state(false);

  const tab = $derived(tabs.find((t) => t.id === selected) ?? tabs[0]!);
  function findFolder(items: DialItem[], id: string): Folder | undefined {
    for (const i of items) {
      if (i.kind !== 'folder') continue;
      if (i.id === id) return i;
      const f = findFolder(i.items, id);
      if (f) return f;
    }
  }
  const crumbs = $derived(crumbIds.map((id) => findFolder(dial.items, id)).filter((f): f is Folder => !!f));
  const view = $derived(crumbs.at(-1) ?? { id: tab.id === 'home' ? dial.id : tab.id, title: tab.label, items: tab.items });
  const folderId = $derived(crumbs.at(-1)?.id ?? (tab.id === 'home' ? dial.id : tab.id));

  const everything = $derived.by(() => {
    const out: { item: DialItem; where: string }[] = [];
    const walk = (items: DialItem[], where: string) => {
      for (const i of items) {
        out.push({ item: i, where });
        if (i.kind === 'folder') walk(i.items, `${where} › ${i.title}`);
      }
    };
    for (const t of tabs) {
      if (t.id !== 'home') out.push({ item: { kind: 'folder', id: t.id, title: t.label, items: t.items }, where: 'Folders' });
      walk(t.items, t.label);
    }
    return out;
  });
  const links = $derived(everything.filter((e) => e.item.kind === 'link') as { item: Extract<DialItem, { kind: 'link' }>; where: string }[]);
  const results = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return everything.filter((e) => (e.item.kind === 'link' ? `${e.item.title} ${e.item.url}` : e.item.title).toLowerCase().includes(q)).slice(0, 60);
  });
  const searching = $derived(!!query.trim());
  $effect(() => {
    void query;
    active = 0;
  });

  function selectTab(id: string) {
    selected = id;
    crumbIds = [];
    localStorage.setItem('proto-tab', id);
  }
  function openFolder(id: string) {
    query = '';
    if (tabs.some((t) => t.id === id)) return selectTab(id);
    const path: string[] = [];
    const walk = (items: DialItem[], trail: string[]): boolean => {
      for (const i of items) if (i.kind === 'folder') {
        if (i.id === id) return path.push(...trail, i.id), true;
        if (walk(i.items, [...trail, i.id])) return true;
      }
      return false;
    };
    const owner = tabs.find((t) => walk(t.items, []));
    if (owner) {
      selected = owner.id;
      crumbIds = path;
    }
  }
  function openItem(e: { item: DialItem }) {
    if (e.item.kind === 'folder') return openFolder(e.item.id);
    location.href = e.item.url;
  }

  // ---- search pill: small until clicked or "/"; type anywhere also opens it ----
  function openSearch() {
    searchOpen = true;
    queueMicrotask(() => searchEl?.focus());
  }
  function searchKeys(e: KeyboardEvent) {
    if (e.key === 'Escape') { query = ''; searchEl?.blur(); }
    else if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); active = Math.min(results.length - 1, active + 1); }
    else if (e.key === 'ArrowUp' && results.length) { e.preventDefault(); active = Math.max(0, active - 1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = results[active];
      if (hit && !e.shiftKey) openItem(hit);
      else if (query.trim()) webSearch(query.trim());
    }
  }
  // ---- new folder, typed in place in the folder strip ----
  let namingFolder = $state(false), newName = $state('');
  let newNameEl = $state<HTMLInputElement>();
  function startFolder() {
    newName = '';
    namingFolder = true;
    queueMicrotask(() => newNameEl?.focus());
  }
  async function commitFolder() {
    if (!namingFolder) return;
    namingFolder = false;
    const name = newName.trim();
    if (!name) return;
    const made = await bm.create(dial.id, folderName(name));
    query = '';
    selectTab(made.id);
  }
  function newNameKeys(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); void commitFolder(); }
    else if (e.key === 'Escape') { e.preventDefault(); namingFolder = false; }
  }

  // ---- keyboard, Vim keys and controller: one set of actions ----
  // Focus moves between tiles in grid order (rows of `cols`); from the first row "up" reaches the folder tabs.
  let navving = $state(false); // show focus as the theme's hover while navigating without a mouse
  let help = $state(false);
  const tileEls = () => [...document.querySelectorAll<HTMLElement>('.grid .card, .grid .icon-tile')];
  const tabEls = () => [...document.querySelectorAll<HTMLElement>('.tabs button')];
  function focusEl(el: HTMLElement | undefined) {
    if (!el) return;
    navving = true;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function move(dir: 'left' | 'right' | 'up' | 'down' | 'first' | 'last') {
    const tiles = tileEls(), a = document.activeElement as HTMLElement | null;
    const tabsNow = tabEls(), ti = a ? tabsNow.indexOf(a) : -1;
    if (ti >= 0) {
      if (dir === 'left' || dir === 'right') return focusEl(tabsNow[(ti + (dir === 'left' ? -1 : 1) + tabsNow.length) % tabsNow.length]);
      if (dir === 'down') return focusEl(tiles[0]);
      return;
    }
    const i = a ? tiles.indexOf(a) : -1;
    if (i < 0) return focusEl(tiles[0]);
    const last = tiles.length - 1;
    const to = dir === 'left' ? i - 1 : dir === 'right' ? i + 1 : dir === 'up' ? i - cols : dir === 'down' ? Math.min(last, i + cols) : dir === 'first' ? 0 : last;
    if (dir === 'up' && to < 0) return focusEl(tabsNow.find((b) => b.classList.contains('on')) ?? tabsNow[0]);
    focusEl(tiles[Math.max(0, Math.min(last, to))]);
  }
  function cycleFolder(d: -1 | 1) {
    if (!tabs.length) return;
    const i = Math.max(0, tabs.findIndex((t) => t.id === selected));
    query = '';
    selectTab(tabs[(i + d + tabs.length) % tabs.length]!.id);
    if (navving) requestAnimationFrame(() => focusEl(tileEls()[0]));
  }
  function back() {
    if (help) return void (help = false);
    if (menu) return void (menu = null);
    if (sheet) return void (sheet = false);
    if (crumbIds.length) return void (crumbIds = crumbIds.slice(0, -1));
    (document.activeElement as HTMLElement | null)?.blur();
  }
  function openFocused(newTab = false) {
    const a = document.activeElement as HTMLElement | null;
    if (!a) return;
    const href = a.getAttribute('href');
    if (newTab && href) bm.openTab(href);
    else a.click();
  }
  let pendingG = 0;
  function pageKeys(e: KeyboardEvent) {
    const t = e.target as Element;
    if (t.closest('input, textarea, select, [contenteditable], dialog, .sheet') || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    const act = (f: () => void) => { e.preventDefault(); f(); };
    if (k === '/') return act(openSearch);
    if (k === '?') return act(() => (help = true));
    if (k === 'Escape') return act(back);
    if (k === 'Backspace' && crumbIds.length) return act(back);
    const arrows: Record<string, 'left' | 'right' | 'up' | 'down' | 'first' | 'last'> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Home: 'first', End: 'last' };
    if (arrows[k]) return act(() => move(arrows[k]!));
    if (k === '[' || k === ']') return act(() => cycleFolder(k === '[' ? -1 : 1));
    if (prefs.vim) {
      const vim: Record<string, () => void> = {
        h: () => move('left'), j: () => move('down'), k: () => move('up'), l: () => move('right'), G: () => move('last'),
        o: () => openFocused(), O: () => openFocused(true), H: () => cycleFolder(-1), L: () => cycleFolder(1),
        g: () => { if (Date.now() - pendingG < 600) { pendingG = 0; move('first'); } else pendingG = Date.now(); },
      };
      if (vim[k]) return act(vim[k]!);
      return; // in Vim mode letters don't open search; "/" does
    }
    if (k.length === 1 && /\S/.test(k)) openSearch();
  }
  $effect(() => watchGamepads((a: PadAction) => {
    const map: Record<PadAction, () => void> = {
      up: () => move('up'), down: () => move('down'), left: () => move('left'), right: () => move('right'),
      open: () => (navving = true, openFocused()), back, search: openSearch, settings: () => (sheet = !sheet),
      prevFolder: () => (navving = true, cycleFolder(-1)), nextFolder: () => (navving = true, cycleFolder(1)),
      menu: () => document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true })),
    };
    map[a]();
  }));

  // ---- stacked toasts, each with its own undo ----
  type Toast = { id: number; text: string; action?: { label: string; run: () => void } };
  let toasts = $state<Toast[]>([]);
  let seq = 0;
  function say(text: string, action?: Toast['action']) {
    const id = ++seq;
    toasts = [...toasts.slice(-2), { id, text, action }];
    setTimeout(() => (toasts = toasts.filter((t) => t.id !== id)), 9000);
  }

  // ---- delete / sort / open all / folders ----
  async function restore(parentId: string, index: number, node: DialItem) {
    if (node.kind === 'link') {
      const made = await bm.create(parentId, node.title, node.url, index);
      copyPicture(node.id, made.id);
      return;
    }
    const f = await bm.create(parentId, node.title, undefined, index);
    for (const [i, c] of node.items.entries()) await restore(f.id, i, c);
  }
  let confirm = $state<{ title: string; body: string; action: string; danger?: boolean; onyes: () => void } | null>(null);
  const countLinks = (items: DialItem[]): number => items.reduce((n, i) => n + (i.kind === 'link' ? 1 : countLinks(i.items)), 0);
  async function reallyDelete(node: DialItem, parent: string, index: number) {
    const snapshot = $state.snapshot(node) as DialItem;
    await bm.remove(node.id, node.kind === 'folder');
    say(`Deleted “${node.title || (node.kind === 'link' ? host(node.url) : 'folder')}”`, { label: 'Undo', run: () => restore(parent, index, snapshot) });
  }
  function del(node: DialItem, parent = folderId) {
    const index = Math.max(0, view.items.findIndex((i) => i.id === node.id));
    // Sites and empty folders go straight away (undo is in the toast); only a folder with things in it asks first.
    if (node.kind === 'link' || node.items.length === 0) return void reallyDelete(node, parent, index);
    const n = countLinks(node.items);
    confirm = {
      title: `Delete “${node.title}”?`,
      body: `This deletes the folder and its ${n} bookmark${n === 1 ? '' : 's'} from your browser, on every device that syncs bookmarks. You can undo for a few seconds afterwards.`,
      action: 'Delete folder', danger: true, onyes: () => reallyDelete(node, parent, index),
    };
  }
  async function sortFolder(id: string, label: string) {
    const kids = await bm.children(id);
    const before = kids.map((k) => k.id);
    const sorted = [...kids].sort((a, b) => Number(a.url !== undefined) - Number(b.url !== undefined) || a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    for (let i = 0; i < sorted.length; i++) await bm.move(sorted[i]!.id, id, i);
    say(`Sorted “${label}” A → Z`, { label: 'Undo', run: async () => { for (let i = 0; i < before.length; i++) await bm.move(before[i]!, id, i); } });
  }
  function openAll(list: DialItem[], label: string) {
    const ls = list.filter((i) => i.kind === 'link');
    const go = () => { for (const l of ls) if (l.kind === 'link') bm.openTab(l.url); };
    if (ls.length > 10) confirm = { title: `Open ${ls.length} tabs?`, body: `All sites in “${label}” open in background tabs.`, action: `Open ${ls.length} tabs`, onyes: go };
    else go();
  }
  let naming = $state<{ title: string; initial?: string; action: string; onsave: (n: string) => void } | null>(null);
  const newFolder = () => (naming = { title: 'New folder', action: 'Create', onsave: (n) => bm.create(folderId, folderName(n)) });
  const rename = (f: { id: string; title: string }) => (naming = { title: 'Rename folder', initial: f.title, action: 'Rename', onsave: (n) => bm.update(f.id, folderName(n)) });
  async function addOpenTabs() {
    const now = await bm.openTabsHere();
    const fresh = now.filter((t) => t.url && /^https?:/.test(t.url) && !links.some((l) => sameSite(l.item.url, t.url!)));
    const made: string[] = [];
    for (const t of fresh) made.push((await bm.create(folderId, t.title || host(t.url!), t.url!)).id);
    say(made.length ? `Added ${made.length} open tab${made.length === 1 ? '' : 's'}` : 'Your open tabs are already on the dial',
      made.length ? { label: 'Undo', run: () => made.forEach((id) => bm.remove(id, false)) } : undefined);
  }

  // ---- menus (with icons) ----
  let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  let edit = $state<{ mode: 'add' | 'edit'; id?: string; title?: string; url?: string } | null>(null);
  let pickFolder = $state(false);

  function moveTo(item: DialItem): MenuItem[] {
    return tabs.filter((t) => (t.id === 'home' ? dial.id : t.id) !== folderId && t.id !== item.id).map((t) => ({
      label: t.label, run: () => bm.move(item.id, t.id === 'home' ? dial.id : t.id),
    }));
  }
  function tileMenu(x: number, y: number, item: DialItem) {
    menu = item.kind === 'link'
      ? { x, y, items: [
          { label: 'Open in new tab', icon: 'external', run: () => bm.openTab(item.url) },
          { label: 'Edit', icon: 'edit', run: () => (edit = { mode: 'edit', id: item.id, title: item.title, url: item.url }) },
          { label: 'Refresh picture', icon: 'refresh', run: () => { forgetPreview(item.url); epoch.n++; } },
          { label: 'Move to', icon: 'move', sub: moveTo(item) },
          'sep',
          { label: 'Delete', icon: 'trash', danger: true, run: () => del(item) },
        ] }
      : { x, y, items: [
          { label: 'Open', icon: 'open', run: () => openFolder(item.id) },
          { label: `Open all (${item.items.filter((i) => i.kind === 'link').length})`, icon: 'tabs', run: () => openAll(item.items, item.title) },
          { label: 'Sort A → Z', icon: 'sort', run: () => sortFolder(item.id, item.title) },
          { label: 'Rename', icon: 'rename', run: () => rename(item) },
          { label: 'Move to', icon: 'move', sub: moveTo(item) },
          'sep',
          { label: 'Delete folder', icon: 'trash', danger: true, run: () => del(item) },
        ] };
  }
  function tabMenu(e: MouseEvent, t: (typeof tabs)[number]) {
    e.preventDefault();
    const id = t.id === 'home' ? dial.id : t.id;
    menu = { x: e.clientX, y: e.clientY, items: [
      { label: `Open all (${t.items.filter((i) => i.kind === 'link').length})`, icon: 'tabs', run: () => openAll(t.items, t.label) },
      { label: 'Sort A → Z', icon: 'sort', run: () => sortFolder(id, t.label) },
      ...(t.id === 'home' ? [] : [
        { label: 'Rename', icon: 'rename' as const, run: () => rename({ id, title: t.label }) },
        'sep' as const,
        { label: 'Delete folder', icon: 'trash' as const, danger: true, run: () => del({ kind: 'folder', id, title: t.label, items: t.items }, dial.id) },
      ]),
    ] };
  }
  // Our menu everywhere on the page; the browser's only where it's useful (text you can edit or copy).
  function pageMenu(e: MouseEvent) {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, [contenteditable]')) return;
    if (e.defaultPrevented) return; // a tile or folder tab showed its own menu
    e.preventDefault();
    if (t.closest('dialog')) return;
    menu = { x: e.clientX, y: e.clientY, items: [
      { label: 'Add site', icon: 'plus', run: () => (edit = { mode: 'add' }) },
      { label: 'Add open tabs', icon: 'tabs', run: addOpenTabs },
      { label: 'New folder', icon: 'folderPlus', run: newFolder },
      'sep',
      { label: 'Keyboard shortcuts', icon: 'keyboard', run: () => (help = true) },
      { label: 'Settings', icon: 'settings', run: () => (sheet = true) },
    ] };
  }

  // ---- paste a link anywhere to add it ----
  async function onpaste(e: ClipboardEvent) {
    const t = e.target instanceof Element ? e.target : document.activeElement;
    if (t?.closest('input, textarea, [contenteditable], dialog')) return;
    const url = toUrl(e.clipboardData?.getData('text') ?? '');
    if (!url) return;
    e.preventDefault();
    const dupe = links.find((l) => sameSite(l.item.url, url));
    const add = async () => {
      const made = await bm.create(folderId, host(url), url);
      say(`Added ${host(url)} to ${view.title}`, { label: 'Undo', run: () => bm.remove(made.id, false) });
      const title = (await previewFor(url)).title;
      if (title) await bm.update(made.id, title, url);
    };
    if (dupe) say(`${host(url)} is already in ${dupe.where}`, { label: 'Add anyway', run: add });
    else await add();
  }

  // ---- drag & drop, Alt+arrows ----
  // ---- drag to reorder: tiles make room live while you drag (like a phone's home screen); drop anywhere commits ----
  let dragged = $state<DialItem | null>(null);
  let dragOrder = $state<string[] | null>(null); // ids in the order shown while dragging
  let intoId = $state<string | null>(null); // folder the dragged site would drop into
  // The tiles stay put in the page while dragging (moving the dragged element makes the browser cancel the drop);
  // only their CSS grid order changes, and a short slide (FLIP) animates each tile to its new place.
  const orderOf = (id: string) => (dragOrder ? dragOrder.indexOf(id) : -1);
  let gridEl = $state<HTMLElement>();
  async function reorderTo(next: string[]) {
    const cells = [...(gridEl?.querySelectorAll<HTMLElement>(':scope > .cell') ?? [])];
    const before = new Map(cells.map((c) => [c, c.getBoundingClientRect()]));
    dragOrder = next;
    await tick();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const c of cells) {
      if (c.querySelector('.lifted')) continue; // animating the dragged tile itself makes the browser cancel the drop
      const a = before.get(c)!, b = c.getBoundingClientRect();
      if (a.left !== b.left || a.top !== b.top) c.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` }, { transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.2,.7,.3,1)' });
    }
  }
  function startDrag(item: DialItem) {
    dragged = item;
    dragOrder = view.items.map((i) => i.id);
  }
  function hoverDrag(target: DialItem, zone: 'before' | 'after' | 'into') {
    if (!dragged || !dragOrder || target.id === dragged.id) return;
    if (zone === 'into' && dragged.kind === 'link') return void (intoId = target.id);
    intoId = null;
    const rest = dragOrder.filter((id) => id !== dragged!.id);
    const at = rest.indexOf(target.id) + (zone === 'after' ? 1 : 0);
    const next = [...rest.slice(0, at), dragged.id, ...rest.slice(at)];
    if (next.join() !== dragOrder.join()) void reorderTo(next);
  }
  /** Over the empty space after the last tile: the dragged tile goes to the end. */
  function hoverEnd(e: DragEvent) {
    if (!dragged || !dragOrder) return;
    const others = [...(gridEl?.querySelectorAll<HTMLElement>(':scope > .cell') ?? [])].filter((c) => !c.querySelector('.lifted'));
    const last = others.map((c) => c.getBoundingClientRect()).sort((a, b) => a.top - b.top || a.left - b.left).at(-1);
    if (!last || !(e.clientY > last.bottom || (e.clientY >= last.top && e.clientX > last.right))) return;
    intoId = null;
    const next = [...dragOrder.filter((id) => id !== dragged!.id), dragged.id];
    if (next.join() !== dragOrder.join()) void reorderTo(next);
  }
  function endDrag(e?: DragEvent) {
    // If the browser skipped the drop (it can while tiles are sliding) but the drag ended over the grid, keep the order
    // you see: what's on screen is what gets saved.
    const r = gridEl?.getBoundingClientRect();
    if (e && dragged && dragOrder && r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom + 40) return void commitDrag();
    dragged = null;
    dragOrder = null;
    intoId = null;
  }
  async function commitDrag() {
    const d = dragged, order = dragOrder, into = intoId;
    if (!d || !order) return endDrag();
    dragged = null; // the drop and the drag's end both land here; only the first one acts
    try {
      if (into) await bm.move(d.id, into);
      else {
        const from = view.items.findIndex((i) => i.id === d.id), to = order.indexOf(d.id);
        if (to !== from) await bm.move(d.id, folderId, to > from ? to + 1 : to);
      }
    } finally {
      dragOrder = null;
      intoId = null;
    }
  }
  const dropOn = (_target: DialItem) => commitDrag();
  // Folder tabs: drag a tab onto another to reorder folders; drop a tile on a tab to move it into that folder.
  let draggedTab = $state<string | null>(null);
  async function dropOnTab(t: (typeof tabs)[number]) {
    if (draggedTab) {
      const from = dial.items.findIndex((i) => i.id === draggedTab), to = dial.items.findIndex((i) => i.id === t.id);
      if (from >= 0 && to >= 0 && from !== to) await bm.move(draggedTab, dial.id, to > from ? to + 1 : to);
      draggedTab = null;
      return;
    }
    if (dragged) await bm.move(dragged.id, t.id === 'home' ? dial.id : t.id);
    endDrag();
  }

  async function step(item: DialItem, dir: -1 | 1) {
    if (searching) return;
    const i = view.items.findIndex((x) => x.id === item.id);
    const to = i + dir;
    if (i < 0 || to < 0 || to >= view.items.length) return;
    await bm.move(item.id, folderId, dir < 0 ? to : to + 1);
    setTimeout(() => document.querySelector<HTMLElement>(`[data-id="${item.id}"]`)?.focus(), 120);
  }

  // ---- site access (granted at install; a browser may still withhold it) ----
  let granted = $state(true);
  const refreshGrant = () => perm.has().then((g) => { granted = g; epoch.n++; });
  refreshGrant();
  perm.onChange(refreshGrant);

  // ---- wallpaper, layout, clock, theme ----
  // Wallpapers draw from a screen-sized local copy (snap) read synchronously, so a new tab opens on the picture
  // instead of showing the theme colour first; the copy is made once per picture.
  let wallpaper = $state<string | null>(null);
  let snap = $state(readSnap());
  if (prefs.wallpaper.kind === 'image' && snap?.src !== 'upload') loadWallpaper().then((u) => (wallpaper = u)).catch(() => {});
  async function setWallpaper(f: File) {
    dropSnap();
    snap = null;
    wallpaper = await saveWallpaper(f);
    prefs.wallpaper = { kind: 'image' };
  }
  let daily = $state<Daily | null>(prefs.wallpaper.kind === 'daily' ? peekDaily(prefs.wallpaper.provider) : null);
  async function loadDaily(refresh = false) {
    if (prefs.wallpaper.kind !== 'daily') return;
    try {
      daily = await dailyWallpaper(prefs.wallpaper.provider, refresh);
    } catch {
      daily = null;
      say('Couldn’t load today’s picture. Try another source.');
    }
  }
  $effect(() => {
    if (prefs.wallpaper.kind === 'daily') {
      void prefs.wallpaper.provider;
      loadDaily();
    }
  });
  // A tab left open overnight picks up the new day's picture when you come back to it.
  $effect(() => {
    const on = () => document.visibilityState === 'visible' && prefs.wallpaper.kind === 'daily' && loadDaily();
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  });

  // Layout by window class. Phone (< 600 px): tight margins, a minimum number of columns so tiles fill the width.
  // Tablet (600–1023): moderate margins, tiles stretch to fill. Desktop: generous margins (~10 % a side,
  // the eye rests on the centre), tiles keep their chosen size. Very wide screens: margins stop growing at 260 px and
  // columns stop at 10, so the grid stays a readable block in the middle.
  let winW = $state(1440);
  let areaW = $state(0);
  // Sites that want a screenshot: all of them with Screenshot pictures, else the tiles set to Screenshot in Edit.
  $effect(() => wantShots(links.filter((l) => prefs.pictures === 'shot' || pictures[l.item.id]?.source === 'shot').map((l) => l.item.url)));
  const captureAll = () => requestShots(links.map((l) => l.item.url));
  // ---- custom scrollbar ----
  let scrollEl = $state<HTMLElement>(), wrapEl = $state<HTMLElement>();
  let sb = $state({ ratio: 1, h: 0, y: 0, track: 0, top0: 0 });
  let sbHover = $state(false), sbDrag = $state(false), sbRecent = $state(false);
  const sbShow = $derived(sbHover || sbRecent);
  let sbTimer: ReturnType<typeof setTimeout>;
  function measure() {
    const el = scrollEl;
    if (!el) return;
    const track = el.clientHeight - 16, ratio = el.clientHeight / el.scrollHeight;
    const h = Math.max(36, track * ratio), max = el.scrollHeight - el.clientHeight;
    sb = { ratio, h, y: max > 0 ? (el.scrollTop / max) * (track - h) : 0, track, top0: el.offsetTop + 8 };
  }
  function pokeBar() {
    sbRecent = true;
    clearTimeout(sbTimer);
    sbTimer = setTimeout(() => (sbRecent = false), 1200);
  }
  function dragBar(e: PointerEvent) {
    const el = scrollEl!, start = e.clientY, top = el.scrollTop;
    const per = (el.scrollHeight - el.clientHeight) / (sb.track - sb.h);
    sbDrag = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const mv = (m: PointerEvent) => (el.scrollTop = top + (m.clientY - start) * per);
    const up = () => { sbDrag = false; removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv);
    addEventListener('pointerup', up);
  }
  $effect(() => {
    if (!scrollEl || !wrapEl) return;
    const ro = new ResizeObserver(measure);
    ro.observe(scrollEl);
    ro.observe(wrapEl);
    return () => ro.disconnect();
  }); // the scrolling area's width (window minus scrollbar space): tiles are sized to this
  const form = $derived(winW < 600 ? 'phone' : winW < 1024 ? 'tablet' : 'desktop');
  const side = $derived(form === 'phone' ? 14 : form === 'tablet' ? Math.round(Math.max(20, winW * 0.05)) : Math.round(Math.min(260, winW * 0.1)));
  const gap = $derived(prefs.tileSize === 'icon' ? (form === 'phone' ? 6 : 12) : form === 'phone' ? 12 : form === 'tablet' ? 16 : fixed.gap);
  const target = $derived(fixed.target[prefs.tileSize]);
  const avail = $derived((areaW || winW) - 2 * side);
  const minCols = $derived(
    form === 'phone' ? { icon: 4, S: 3, M: 2, L: 2, XL: 1 }[prefs.tileSize] : form === 'tablet' ? { icon: 5, S: 4, M: 3, L: 2, XL: 2 }[prefs.tileSize] : 1,
  );
  const fit = $derived(Math.max(minCols, Math.floor((avail + gap) / (target + gap))));
  const cols = $derived(Math.max(Math.min(minCols, fit), Math.min(prefs.maxColumns || fixed.cap, fit)));
  const tileW = $derived(form === 'desktop' ? Math.min(target * 1.25, (avail - (cols - 1) * gap) / cols) : (avail - (cols - 1) * gap) / cols);
  const wrapW = $derived(cols * tileW + (cols - 1) * gap);

  let now = $state(new Date());
  setInterval(() => (now = new Date()), 30_000);
  const clock = $derived(now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
  let systemDark = $state(matchMedia('(prefers-color-scheme: dark)').matches);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => (systemDark = e.matches));
  const theme = $derived(themeById(prefs.themeId));
  const dark = $derived(isDark(theme, prefs.theme === 'auto' ? systemDark : prefs.theme === 'dark'));
  // Openmarks takes its accent from the wallpaper's most prominent colour (adjusted until it reads on the theme's
  // surfaces); neutral without a wallpaper. Other themes keep their own (Vapor blue, Cyberpunk yellow…).
  const accent = $derived.by(() => {
    if (theme.id !== 'openmarks' || !wallColor) return null;
    return accentFrom(wallColor, themeVars(theme, dark, false)['--surface']!, dark);
  });
  const vars = $derived(Object.entries({ ...themeVars(theme, dark, prefs.glass), ...(accent ? { '--ring': accent, '--on-ring': onAccent(accent) } : {}) }).map(([k, v]) => `${k}: ${v}`).join('; '));
  const w = $derived(prefs.wallpaper);
  const wallSrc = $derived(w.kind === 'image' ? 'upload' : w.kind === 'daily' ? daily?.url : undefined);
  const wallUrl = $derived(wallSrc && snap?.src === wallSrc ? snap.data : w.kind === 'image' ? wallpaper : w.kind === 'daily' ? daily?.url : undefined);
  $effect(() => {
    const src = wallSrc, from = w.kind === 'image' ? wallpaper : daily?.url;
    if (src && from && snap?.src !== src) makeSnap(src, from).then((s) => s && (snap = s));
  });
  const bg = $derived(
    w.kind === 'color' ? w.color
    : w.kind === 'gradient' ? `linear-gradient(${w.angle}deg, ${w.colors.join(', ')}) fixed`
    : wallUrl ? `center / cover fixed url("${wallUrl}")`
    : undefined,
  );
  // The wallpaper's most prominent colour (for the Openmarks accent).
  let wallColor = $state<[number, number, number] | null>(null);
  $effect(() => {
    const rgbOf = (c: string) => (c.match(/[0-9a-f]{2}/gi)?.map((h) => parseInt(h, 16)) ?? [128, 128, 128]) as [number, number, number];
    const fromColors = (cs: string[]) => prominent(new Uint8ClampedArray(cs.flatMap((c) => [...rgbOf(c), 255])));
    if (w.kind === 'none') wallColor = null;
    else if (w.kind === 'color') wallColor = fromColors([w.color]);
    else if (w.kind === 'gradient') wallColor = fromColors(w.colors);
    else if (wallUrl) {
      const src = wallUrl;
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.src = src;
      im.decode().then(() => {
        if (src !== wallUrl) return;
        const x = new OffscreenCanvas(48, 27).getContext('2d', { willReadFrequently: true })!;
        x.drawImage(im, 0, 0, 48, 27);
        wallColor = prominent(x.getImageData(0, 0, 48, 27).data);
      }).catch(() => {});
    }
  });
  // Remember the first paint for boot.js (next new tab): the background as drawn now.
  $effect(() => saveBoot({ bg: (w.kind === 'color' || w.kind === 'gradient' ? bg : undefined)?.replace(' fixed', '') ?? themeVars(theme, dark, false)['--bg']!, dark, wall: !!(wallSrc && snap?.src === wallSrc) }));
  const onPhoto = $derived(w.kind !== 'none');
  const isFirstRun = $derived(!searching && dial.items.length === 0);
  const folderLabel = $derived(prefs.dialFolder ? dial.title : 'Openmarks');
  const searchWide = $derived(searchOpen || searching);
  const iconMode = $derived(prefs.tileSize === 'icon');
</script>

<svelte:window {onpaste} onkeydown={pageKeys} onmousemove={() => (navving = false)} oncontextmenu={pageMenu} bind:innerWidth={winW} />

<div
  class="page" class:dark class:on-photo={onPhoto}
  style={vars} data-form={form} style:--side="{side}px" style:--tile="{tileW}px" style:--cols={cols} style:--gap="{gap}px" style:--row-gap="{iconMode ? 30 : gap}px" style:--font="{fixed.fontSize}px" style:--wrap="{wrapW}px"
  style:background={bg} class:navving class:solid={!prefs.glass} role="presentation"
>
  <header class="bar">
    <div class="barin">
      <div class="tabpill">
      <nav class="tabs" aria-label="Folders">
        {#each tabs as t (t.id)}
          <button
            aria-current={!searching && t.id === selected ? 'page' : undefined} class:on={!searching && t.id === selected}
            onclick={() => { query = ''; selectTab(t.id); }} oncontextmenu={(e) => tabMenu(e, t)}
            draggable={t.id !== 'home'} ondragstart={(e) => { if (t.id === 'home') return; draggedTab = t.id; e.dataTransfer?.setData('text/plain', t.id); }} ondragend={() => (draggedTab = null)}
            ondragover={(e) => e.preventDefault()} ondrop={(e) => { e.preventDefault(); dropOnTab(t); }}
          >{t.label}</button>
        {/each}
      </nav>
      {#if namingFolder}
        <!-- New folder, named right here: Enter creates it, Esc or an empty name cancels. -->
        <input class="newname" bind:this={newNameEl} bind:value={newName} placeholder="Folder name" aria-label="New folder name"
          style:width="{Math.max(18, newName.length + 3)}ch" onkeydown={newNameKeys} onblur={commitFolder} />
      {:else}
        <button class="newfolder" aria-label="New folder" title="New folder" onclick={startFolder}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d={icons.plus} /></svg>
        </button>
      {/if}
      </div>

      <div class="corner">
        {#if prefs.clock && form !== 'phone'}<span class="clock">{clock}</span>{/if}
        {#if prefs.search}
          <form class="search" class:wide={searchWide} role="search" onsubmit={(e) => e.preventDefault()}>
            {#if !searchWide}<span class="tip" aria-hidden="true">Search <kbd>/</kbd></span>{/if}
            <button type="button" class="ibtn" aria-label="Search (press /)" aria-keyshortcuts="/" onclick={openSearch}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            </button>
            <input bind:this={searchEl} type="search" placeholder="Search your dial" aria-label="Search your dial" tabindex={searchWide ? 0 : -1}
              bind:value={query} onkeydown={searchKeys} onfocus={() => (searchOpen = true)} onblur={() => (searchOpen = false)} />
          </form>
        {/if}
      </div>
    </div>
  </header>

  <div class="scroller" bind:this={scrollEl} bind:clientWidth={areaW} onscroll={() => { measure(); pokeBar(); }}>
  <div class="wrap" bind:this={wrapEl}>

    {#if !granted}
      <div class="banner" role="status">
        <span>Logos and previews need permission to read the sites on your dial.</span>
        <button onclick={() => perm.request().then(refreshGrant)}>Allow</button>
      </div>
    {/if}

    {#if searching}
      <button class="web" onclick={() => webSearch(query.trim())}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>
        <span>Search the web for “{query.trim()}”</span><kbd>{results.length ? 'Shift ↵' : '↵'}</kbd>
      </button>
    {/if}

    {#if !searching && crumbs.length}
      <nav class="crumbs" aria-label="Folder path">
        <button onclick={() => (crumbIds = [])}>{tab.label}</button>
        {#each crumbs as c, i (c.id)}<span aria-hidden="true">›</span><button onclick={() => (crumbIds = crumbIds.slice(0, i + 1))}>{c.title}</button>{/each}
      </nav>
    {/if}

    {#if isFirstRun}
      <section class="first">
        <h1>Your dial is empty</h1>
        <div class="choices">
          <button class="choice" onclick={() => (pickFolder = true)}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d={icons.open} /></svg><strong>Use a folder</strong></button>
          <button class="choice" onclick={addOpenTabs}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d={icons.tabs} /></svg><strong>Add open tabs</strong></button>
          <button class="choice" onclick={() => (edit = { mode: 'add' })}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d={icons.plus} /></svg><strong>Add a site</strong></button>
        </div>
        <p>Tip: paste any link on this page to add it.</p>
      </section>
    {:else if searching}
      {#if results.length}
        <main class="grid" aria-label="Search results">
          {#each results as r, i (r.item.id)}
            <Card item={r.item} {dark} where={r.where} active={i === active} onopen={openFolder} onmenu={tileMenu} onmove={step} ondragstart={() => {}} ondrop={() => {}} />
          {/each}
        </main>
      {:else}
        <p class="none">Nothing on your dial matches. Press Enter to search the web.</p>
      {/if}
    {:else if view.items.length === 0}
      <p class="none">This folder is empty. Paste a link here or add one.</p>
      {#if prefs.addButton}<button class="add solo" aria-label="Add site" onclick={() => (edit = { mode: 'add' })}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d={icons.plus} /></svg></button>{/if}
    {:else}
      <main class="grid" bind:this={gridEl} aria-label={view.title} ondragover={(e) => { if (!dragged) return; e.preventDefault(); if (e.target === gridEl) hoverEnd(e); }} ondrop={(e) => { e.preventDefault(); void commitDrag(); }}>
        {#each view.items as item (item.id)}
          <div class="cell" style:order={dragOrder ? orderOf(item.id) : undefined}>
            <Card {item} {dark} onopen={openFolder} onmenu={tileMenu} onmove={step} ondragstart={startDrag} ondrop={dropOn}
              onhover={hoverDrag} ondragend={endDrag} into={intoId === item.id} lifted={dragged?.id === item.id} />
          </div>
        {/each}
        {#if prefs.addButton}
          <!-- The add pill sticks to the last tile: on its right while the row has room, under it when the next tile
               would start a new row. Its shape and hover follow the theme. -->
          {@const below = view.items.length % cols === 0}
          <button
            class="addpill" class:below class:icon={iconMode} style:grid-column={below ? String(cols) : undefined} style:order="9999"
            aria-label="Add site" onclick={() => (edit = { mode: 'add' })}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d={icons.plus} /></svg>
            <span>Add</span>
          </button>
        {/if}
      </main>
    {/if}
  </div>
  </div>
  <!-- Our own scrollbar: overlays the edge (no reserved gutter), theme-coloured, only when the page overflows. -->
  {#if sb.ratio < 1}
    <div class="sbar" class:show={sbShow || sbDrag} style:top="{sb.top0}px" style:height="{sb.track}px" aria-hidden="true"
      onpointerenter={() => (sbHover = true)} onpointerleave={() => (sbHover = false)}>
      <div class="sthumb" style:height="{sb.h}px" style:transform="translateY({sb.y}px)" onpointerdown={dragBar}></div>
    </div>
  {/if}

  <div class="toasts" role="status" aria-live="polite">
    {#each toasts as t (t.id)}
      <div class="toast"><span>{t.text}</span>{#if t.action}<button onclick={() => { t.action!.run(); toasts = toasts.filter((x) => x.id !== t.id); }}>{t.action.label}</button>{/if}</div>
    {/each}
  </div>

  {#if menu}<Menu {...menu} onclose={() => (menu = null)} />{/if}
  {#if edit}
    <EditDialog mode={edit.mode} id={edit.id} initialTitle={edit.title} initialUrl={edit.url} {folderId}
      {dark} existing={links.map((l) => ({ id: l.item.id, url: l.item.url, where: l.where }))} onclose={() => (edit = null)}
      ondelete={() => { const e = edit; const hit = links.find((l) => l.item.id === e?.id); edit = null; if (hit) del(hit.item); }} />
  {/if}
  {#if confirm}<ConfirmDialog {...confirm} onclose={() => (confirm = null)} />{/if}
  {#if naming}<NameDialog {...naming} onclose={() => (naming = null)} />{/if}
  {#if pickFolder}<FolderPicker current={prefs.dialFolder} onpick={(id) => { prefs.dialFolder = id; savePrefs(); selectTab('home'); reload(); }} onclose={() => (pickFolder = false)} />{/if}
  <!-- Settings live in the corner, out of the way of the folders and the tiles. -->
  <button class="gearfab" aria-label="Settings" title="Settings" aria-expanded={sheet} onclick={() => (sheet = !sheet)}>
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={icons.settings} /></svg>
  </button>
  {#if help}<KeysHelp vim={prefs.vim} onclose={() => (help = false)} />{/if}
  {#if sheet}<SettingsSheet {dark} oncaptureall={captureAll} {folderLabel} {daily} onrefreshdaily={() => loadDaily(true)} onclose={() => (sheet = false)} onpickfolder={() => (pickFolder = true)} onwallpaper={setWallpaper} />{/if}
</div>

<style>
  /* Colours, corners, type and glass come from the theme engine (themes.ts) as CSS variables on .page. */
  .page {
    min-height: 100vh; color: var(--text); background: var(--bg); background-attachment: fixed;
    font: 14px/1.4 var(--font-family);
  }
  /* The bar never overlaps the tiles: tiles scroll in their own area and fade out softly at its top edge. */
  .page { height: 100vh; display: flex; flex-direction: column; overflow: hidden; position: relative; }
  .bar { flex: none; position: relative; z-index: 2; }
  .scroller { flex: 1; overflow-y: auto; mask-image: linear-gradient(to bottom, transparent 0, #000 20px); scrollbar-width: none; }
  .scroller::-webkit-scrollbar { display: none; }
  .sbar { position: absolute; right: 3px; width: 12px; z-index: 5; opacity: 0; transition: opacity 0.25s; }
  .sbar.show, .sbar:hover { opacity: 1; }
  .sthumb { position: absolute; right: 2px; width: 6px; border-radius: 6px; background: color-mix(in srgb, var(--text) 35%, transparent); transition: width 0.12s, background 0.12s; cursor: grab; }
  .sbar:hover .sthumb { width: 8px; background: color-mix(in srgb, var(--text) 55%, transparent); }
  .wrap { width: var(--wrap); max-width: calc(100% - 2 * var(--side)); margin: 0 auto; padding: 4px 0 28px; }
  /* The folder tabs, search and settings sit on the same quiet pane as the tiles, so they read on any wallpaper. */
  .search, .clock { background: var(--pane); backdrop-filter: var(--backdrop); border: var(--border); box-shadow: var(--shadow); }
  /* The bar's pieces sit on the theme's own pane, in the tiles' shape (search and settings round). */
  .tabpill, .search, .clock { background: var(--pane); backdrop-filter: var(--backdrop); border: var(--border); box-shadow: var(--shadow); }
  .tabpill { border-radius: var(--radius); clip-path: var(--notch); }
  .tabpill { display: flex; align-items: center; min-width: 0; max-width: 100%; height: 38px; box-sizing: border-box; padding: 0 3px; }
  .newfolder { flex: none; display: grid; place-items: center; width: 30px; height: 30px; margin-left: 2px; padding: 0; border: 0; border-radius: var(--radius-sm);
    background: none; color: var(--muted); cursor: pointer; opacity: 0.7; }
  .newfolder:hover, .newfolder:focus-visible { opacity: 1; background: var(--hover-title-bg); color: var(--hover-title-text); }
  .search { position: relative; height: 38px; box-sizing: border-box; border-radius: 999px; }
  .tip { position: absolute; right: calc(100% + 8px); top: 50%; transform: translateY(-50%); white-space: nowrap; pointer-events: none;
    padding: 4px 8px; border-radius: 6px; background: var(--surface); color: var(--muted); font-size: 12px; box-shadow: var(--shadow); opacity: 0; transition: opacity 0.12s 0.25s; }
  .tip kbd { margin-left: 4px; padding: 0 5px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 4px; font: 600 11px/1.4 ui-monospace, monospace; color: var(--text); }
  .search:hover .tip, .search:focus-within .tip { opacity: 1; }
  .clock { display: flex; align-items: center; height: 38px; box-sizing: border-box; padding: 0 12px; border-radius: var(--radius); }
  /* Keyboard / controller focus looks like the theme's hover (Cyberpunk yellow, Retro blue…). */
  :global(.navving) :global(.card:focus), :global(.navving) :global(.icon-tile:focus .sq) { outline: none; transform: translateY(var(--hover-lift)) scale(var(--hover-scale)); box-shadow: var(--hover-shadow), 0 0 0 2px var(--ring); border-color: var(--hover-edge); }
  :global(.navving) :global(.card:focus .cap) { background: var(--hover-title-bg); color: var(--hover-title-text); }
  .tabs button:focus-visible, .navving .tabs button:focus { outline: none; box-shadow: inset 0 0 0 2px var(--ring); background: color-mix(in srgb, var(--ring) 12%, transparent); color: var(--text); }
  .newfolder:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--ring); }
  /* Just a text box: no ring, no glow, and room to type a real name. */
  .newname { height: 28px; min-width: 18ch; max-width: 260px; margin: 0 2px; padding: 0 10px; border: 0; border-radius: var(--radius-sm); box-sizing: border-box;
    background: color-mix(in srgb, var(--text) 9%, transparent); color: var(--text); font: inherit; text-transform: uppercase; letter-spacing: 0.04em;
    outline: none; box-shadow: none; }
  .newname:focus, .newname:focus-visible { outline: none; box-shadow: none; }
  .newname::placeholder { color: var(--muted); text-transform: none; }
  .barin { width: var(--wrap); max-width: calc(100% - 2 * var(--side)); margin: 0 auto; }
  :focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }

  /* one top bar: folders (scroll sideways) | search pill | clock + gear */
  .barin { display: flex; align-items: center; gap: 16px; height: 60px; }
  .barin .tabpill { flex: 0 1 auto; margin-right: auto; }
  .tabs { display: flex; gap: 2px; overflow-x: auto; scrollbar-width: none; min-width: 0; mask-image: linear-gradient(to right, #000 calc(100% - 16px), transparent); padding-right: 12px; }
  .tabs::-webkit-scrollbar { display: none; }
  .tabs button { flex: none; border: 0; background: none; color: var(--muted); font: inherit; cursor: pointer; padding: 6px 10px; border-radius: var(--radius-sm); white-space: nowrap;
    text-transform: uppercase; letter-spacing: 0.04em; }
  .tabs button:hover { color: var(--text); }
  .tabs button.on { color: var(--text); font-weight: var(--tab-weight); }
  .corner { flex: none; display: flex; align-items: center; gap: 8px; }
  .clock { font-variant-numeric: tabular-nums; color: var(--muted); padding: 0 6px; }
  .ibtn { flex: none; display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 50%; background: none; color: var(--muted); cursor: pointer; }
  .gearfab { position: fixed; right: 20px; bottom: 20px; z-index: 20; width: 40px; height: 40px; display: grid; place-items: center; padding: 0;
    border-radius: 50%; border: var(--border); background: var(--pane); backdrop-filter: var(--backdrop);
    color: var(--muted); cursor: pointer; opacity: 0.75; transition: opacity 0.14s, background 0.14s, color 0.14s, box-shadow 0.14s, transform 0.3s; }
  .gearfab:hover, .gearfab:focus-visible, .gearfab[aria-expanded='true'] { opacity: 1; background: var(--hover-title-bg); color: var(--hover-title-text); box-shadow: var(--hover-shadow); border-color: var(--hover-edge); }
  .gearfab:hover svg { transform: rotate(45deg); }
  .gearfab svg { transition: transform 0.3s; }
  @media (prefers-reduced-motion: reduce) { .gearfab:hover svg { transform: none; } }
  .addpill {
    --r: max(calc(var(--radius) * 1.6), 3px);
    justify-self: start; align-self: center; margin-left: calc(-1 * var(--gap));
    display: flex; align-items: center; justify-content: center; gap: 0; width: 26px; height: 64px; padding: 0; overflow: hidden;
    border: var(--border); border-left: 0; border-radius: 0 var(--r) var(--r) 0;
    background: var(--pane); backdrop-filter: var(--backdrop); color: var(--muted); box-shadow: none; cursor: pointer; font: inherit; font-size: 13px;
    transition: width 0.16s ease, height 0.16s ease, background 0.14s, color 0.14s, box-shadow 0.14s;
  }
  .addpill span { max-width: 0; opacity: 0; overflow: hidden; white-space: nowrap; transition: max-width 0.16s ease, opacity 0.12s, margin 0.16s; }
  .addpill:hover span, .addpill:focus-visible span { max-width: 40px; opacity: 1; margin-left: 6px; }
  .addpill:hover:not(.below):not(.icon), .addpill:focus-visible:not(.below):not(.icon) { width: 76px; }
  .addpill.below:hover, .addpill.below:focus-visible { width: 96px; height: 30px; }
  .addpill.icon:hover:not(.below), .addpill.icon:focus-visible:not(.below) { width: 72px; }
  .addpill:hover, .addpill:focus-visible { background: var(--hover-title-bg); color: var(--hover-title-text); box-shadow: var(--hover-shadow); border-color: var(--hover-edge); }
  .addpill.below { justify-self: center; align-self: start; margin: calc(-1 * var(--row-gap)) 0 0; width: 72px; height: 24px;
    border: var(--border); border-top: 0; border-radius: 0 0 var(--r) var(--r); }
  /* icon view: stick to the square, not the whole cell */
  .addpill.icon { align-self: start; margin-top: 12px; height: 40px; margin-left: calc(-1 * var(--gap) - (var(--tile) - 64px) / 2); }
  .addpill.icon.below { margin: calc(-1 * var(--row-gap) + 4px) 0 0; height: 22px; border-top: var(--border); border-radius: var(--r); }
  .add { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; border: 1px dashed color-mix(in oklab, var(--muted) 55%, transparent);
    background: var(--pane); backdrop-filter: var(--backdrop); color: var(--muted); cursor: pointer; padding: 0; }
  .add:hover { color: var(--text); border-style: solid; background: var(--surface); }
  .add.solo { margin: 12px auto 0; }
  .ibtn:hover { color: var(--text); background: color-mix(in oklab, currentColor 12%, transparent); }

  .search { display: flex; align-items: center; transition: background 0.18s; }
  .search input { width: 0; padding: 0; border: 0; outline: 0; background: none; color: var(--text); font: inherit; font-size: 13px; transition: width 0.18s ease, padding 0.18s; }
  .search.wide { background: var(--surface); color: var(--text); text-shadow: none; }
  .search.wide input { width: min(240px, 30vw); padding-right: 12px; }
  .search.wide .ibtn:hover { background: none; }
  .search input::placeholder { color: var(--muted); }
  .search input::-webkit-search-cancel-button { display: none; }
  kbd { font: 11px ui-monospace, monospace; color: var(--muted); border: 1px solid var(--line); border-radius: 4px; padding: 0 5px; }

  .banner { display: flex; gap: 12px; align-items: center; padding: 8px 14px; border-radius: 999px; background: var(--surface); border: 1px solid var(--line); font-size: 13px; margin-top: 4px; }
  .banner span { flex: 1; color: var(--muted); }
  .banner button { border: 0; background: var(--ring); color: var(--on-ring); border-radius: 999px; padding: 5px 12px; font: 600 12px system-ui; cursor: pointer; }
  .web { display: flex; align-items: center; gap: 8px; margin: 4px auto 0; padding: 6px 12px; border: 0; border-radius: 999px; background: var(--surface); color: var(--muted); font: inherit; font-size: 13px; cursor: pointer; box-shadow: var(--shadow); }
  .web:hover { color: var(--text); }
  .crumbs { display: flex; align-items: center; gap: 2px; margin: 8px 0 0 -10px; color: var(--muted); }
  .crumbs button { border: 0; background: none; color: inherit; font: inherit; cursor: pointer; padding: 4px 10px; border-radius: 6px; }
  .crumbs button:hover { color: var(--text); }
  .grid { display: grid; grid-template-columns: repeat(var(--cols), var(--tile)); gap: var(--row-gap) var(--gap); margin-top: 20px; }
  .none { margin: 48px auto 0; max-width: 420px; text-align: center; color: var(--muted); line-height: 1.5; }
  .on-photo .none, .on-photo .first { background: var(--chrome); backdrop-filter: blur(10px); border-radius: 12px; padding: 12px 16px; }
  .first { margin: 12vh auto 0; max-width: 520px; text-align: center; }
  .first h1 { font-size: 18px; font-weight: 600; margin: 0 0 18px; }
  .first p { margin: 16px 0 0; color: var(--muted); font-size: 13px; }
  .choices { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .choice { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 18px 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--text); font: inherit; font-size: 13px; cursor: pointer; box-shadow: var(--shadow); }
  .choice svg { color: var(--muted); }
  .choice:hover { border-color: var(--ring); }
  .toasts { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); display: flex; flex-direction: column; gap: 8px; align-items: center; z-index: 40; }
  .toast { display: flex; gap: 16px; align-items: center; padding: 9px 14px; border-radius: 999px; background: color-mix(in srgb, #1f2328 var(--float-alpha), transparent); backdrop-filter: var(--float-blur); color: #f5f6f8; box-shadow: 0 8px 24px rgb(0 0 0 / 0.25); font-size: 13px; }
  .dark .toast { background: color-mix(in srgb, #e8e9ec var(--float-alpha), transparent); color: #18191c; }
  .toast button { border: 0; background: none; color: #8fb0ff; font: 600 13px system-ui; cursor: pointer; }
  .dark .toast button { color: #2453c9; }
  @media (prefers-reduced-motion: reduce) { :global(*) { transition: none !important; animation: none !important; } }

  /* ── Phones and tablets ── */
  .page[data-form='phone'] .barin { height: 52px; gap: 8px; }
  .page[data-form='phone'] .grid { margin-top: 12px; }
  .page[data-form='phone'] .search.wide input { width: calc(100vw - 2 * var(--side) - 120px); }
  .page[data-form='phone'] .tip { display: none; }
  .gearfab { right: calc(16px + env(safe-area-inset-right)); bottom: calc(16px + env(safe-area-inset-bottom)); }
  .page[data-form='phone'] .wrap { padding-bottom: calc(88px + env(safe-area-inset-bottom)); }
  /* Touch: bigger targets, no hover-only affordances. */
  @media (pointer: coarse) {
    .addpill { width: 36px; }
    .addpill.below { width: 88px; height: 32px; }
    .newfolder, .ibtn { width: 40px; height: 40px; }
    .gearfab { width: 48px; height: 48px; opacity: 1; }
    .tip { display: none; }
  }
  .cell { min-width: 0; display: flex; }
  .cell > :global(*) { flex: 1; min-width: 0; }
</style>
