<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- The Dial page. Sane defaults, few choices:
     one top bar: folder names (scroll sideways when many) · a small search pill that expands on click or "/" · clock; settings in the bottom-right corner;
     Vivaldi cards; a small round "+" to add; menus with icons; settings as a visual sheet from the bottom;
     select several tiles (Select in a menu) to move, open or delete them together; search like Spotlight (Spotlight.svelte)
     from a button, a bar, "/" or by just typing. -->
<script lang="ts">
  import type { DialFolder, DialItem } from '@openmarks/module-sdk';
  import { tabsFrom, host, folderName } from './shared';
  import { prefs, epoch, fixed, savePrefs } from './prefs.svelte';
  import { copyPicture, pictures } from './pictures.svelte';
  import { wantShots, requestShots } from './shots.svelte';
  import { bm, perm, sameSite, toUrl } from './bm';
  import { previewFor, forgetPreview } from './preview';
  import { saveWallpaper, loadWallpaper, dailyWallpaper, peekDaily, readSnap, makeSnap, keepSnap, dropSnap, saveBoot, type Daily } from './wallpaper';
  import { icons } from './icons';
  import { themeById, themeVars, isDark, prominent, accentFrom, onAccent } from './themes';
  import { ownThemes } from './ownthemes.svelte';
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
  import EngineIcon from './EngineIcon.svelte';
  import { engineById } from './search';
  import Spotlight from './Spotlight.svelte';
  import EnginePicker from './EnginePicker.svelte';

  let { dial, reload }: { dial: DialFolder; reload: () => void } = $props();
  bm.onChange(() => reload());

  type Folder = Extract<DialItem, { kind: 'folder' }>;
  const tabs = $derived(tabsFrom(dial));
  let selected = $state(localStorage.getItem('proto-tab') ?? 'home');
  let crumbIds = $state<string[]>([]);
  let sheet = $state(false);

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
  // ---- search (Spotlight.svelte): the button or bar, "/", or just start typing; null = closed ----
  let spot = $state<string | null>(null);
  const searching = $derived(spot !== null);
  // The panel grows out of the search bar or button (and goes back into it when it closes).
  let barEl = $state<HTMLElement>(), searchBtn = $state<HTMLElement>(), spotRef = $state<{ close(): void }>();
  let spotFrom = $state<{ rect: DOMRect; kind: 'bar' | 'icon' }>();
  function openSearch(text = '') {
    if (prefs.searchStyle === 'off' || spot !== null) return;
    const el = prefs.searchStyle === 'bar' ? barEl : searchBtn;
    spotFrom = el ? { rect: el.getBoundingClientRect(), kind: prefs.searchStyle === 'bar' ? 'bar' : 'icon' } : undefined;
    spot = text;
  }
  let pickEngine = $state(false);

  function selectTab(id: string) {
    selected = id;
    crumbIds = [];
    localStorage.setItem('proto-tab', id);
  }
  function openFolder(id: string) {
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
    selectTab(tabs[(i + d + tabs.length) % tabs.length]!.id);
    if (navving) requestAnimationFrame(() => focusEl(tileEls()[0]));
  }
  function back() {
    if (spot !== null) return void spotRef?.close();
    if (help) return void (help = false);
    if (menu) return void (menu = null);
    if (sheet) return void (sheet = false);
    if (selecting) return endSelect();
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
    if (menu) return; // an open menu has the keys (arrows, Enter, Esc) to itself
    // Search just opened and its box doesn't have focus yet: what you type goes into it, not lost.
    if (spot !== null && !t.closest('.spot')) {
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); spot += e.key; }
      return;
    }
    if (t.closest('input, textarea, select, [contenteditable], dialog, .sheet') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('dialog[open]')) return; // an open dialog has the keys (Esc closes it, not the page's layers)
    const k = e.key;
    const act = (f: () => void) => { e.preventDefault(); f(); };
    if (k === '/') return act(() => openSearch());
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
    if (k.length === 1 && /\S/.test(k) && prefs.searchStyle !== 'off') act(() => openSearch(k));
  }
  $effect(() => watchGamepads((a: PadAction) => {
    const map: Record<PadAction, () => void> = {
      up: () => move('up'), down: () => move('down'), left: () => move('left'), right: () => move('right'),
      open: () => (navving = true, openFocused()), back, search: () => openSearch(), settings: () => (sheet = !sheet),
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
  // ---- select several tiles: Select (tile or page menu), then click tiles to add or remove them, Shift+click a range ----
  let selecting = $state(false);
  let picked = $state<string[]>([]);
  let lastPick: string | null = null;
  const pickedItems = $derived(view.items.filter((i) => picked.includes(i.id)));
  function startSelect(id?: string) {
    selecting = true;
    picked = id ? [id] : [];
    lastPick = id ?? null;
  }
  function endSelect() {
    selecting = false;
    picked = [];
    lastPick = null;
  }
  function togglePick(id: string, range: boolean) {
    const ids = view.items.map((i) => i.id);
    const a = lastPick ? ids.indexOf(lastPick) : -1, b = ids.indexOf(id);
    if (range && a >= 0 && b >= 0) picked = [...new Set([...picked, ...ids.slice(Math.min(a, b), Math.max(a, b) + 1)])];
    else picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
    lastPick = id;
  }
  // Another folder, or a search, ends the selection.
  $effect(() => {
    void folderId;
    if (searching) endSelect();
    return endSelect;
  });
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
  /** Folders the selection can go to: the folder tabs and the folders next to it, minus where it is and itself. */
  const targets = (items: DialItem[]) => {
    const out = new Map<string, string>();
    for (const t of tabs) out.set(t.id === 'home' ? dial.id : t.id, t.label);
    for (const i of view.items) if (i.kind === 'folder') out.set(i.id, i.title);
    out.delete(folderId);
    for (const i of items) out.delete(i.id);
    return [...out];
  };
  async function moveMany(items: DialItem[], to: string, label: string) {
    const from = folderId;
    const back = items.map((i) => ({ id: i.id, index: view.items.findIndex((x) => x.id === i.id) })).sort((a, b) => a.index - b.index);
    for (const b of back) await bm.move(b.id, to);
    endSelect();
    say(`Moved ${plural(items.length, 'item')} to ${label}`, { label: 'Undo', run: async () => { for (const b of back) await bm.move(b.id, from, b.index); } });
  }
  async function deleteMany(items: DialItem[]) {
    const parent = folderId;
    const snaps = items.map((i) => ({ index: view.items.findIndex((x) => x.id === i.id), node: $state.snapshot(i) as DialItem })).sort((a, b) => a.index - b.index);
    for (const s of snaps) await bm.remove(s.node.id, s.node.kind === 'folder');
    endSelect();
    say(`Deleted ${plural(items.length, 'item')}`, { label: 'Undo', run: async () => { for (const s of snaps) await restore(parent, s.index, s.node); } });
  }
  function delMany(items: DialItem[]) {
    if (items.length === 1) return del(items[0]!);
    const n = countLinks(items.filter((i) => i.kind === 'folder'));
    if (!n) return void deleteMany(items);
    confirm = {
      title: `Delete ${plural(items.length, 'item')}?`,
      body: `This also deletes ${plural(n, 'bookmark')} inside the selected folders, on every device that syncs bookmarks. You can undo for a few seconds afterwards.`,
      action: 'Delete', danger: true, onyes: () => deleteMany(items),
    };
  }
  const moveManyTo = (items: DialItem[]): MenuItem[] => targets(items).map(([id, label]) => ({ label, run: () => moveMany(items, id, label) }));
  function selectionMenu(x: number, y: number) {
    const items = pickedItems;
    const n = items.filter((i) => i.kind === 'link').length;
    menu = { x, y, items: [
      { label: 'Move to', icon: 'move', sub: moveManyTo(items), disabled: !items.length },
      { label: `Open all (${n})`, icon: 'tabs', run: () => openAll(items, plural(items.length, 'selected item')), disabled: !n },
      { label: 'Select all', icon: 'check', run: () => (picked = view.items.map((i) => i.id)) },
      'sep',
      { label: `Delete (${items.length})`, icon: 'trash', danger: true, run: () => delMany(items), disabled: !items.length },
    ] };
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
  let menu = $state<{ x: number; y: number; items: MenuItem[]; above?: boolean } | null>(null);
  let edit = $state<{ mode: 'add' | 'edit'; id?: string; title?: string; url?: string } | null>(null);
  let pickFolder = $state(false);

  function moveTo(item: DialItem): MenuItem[] {
    return tabs.filter((t) => (t.id === 'home' ? dial.id : t.id) !== folderId && t.id !== item.id).map((t) => ({
      label: t.label, run: () => bm.move(item.id, t.id === 'home' ? dial.id : t.id),
    }));
  }
  function tileMenu(x: number, y: number, item: DialItem) {
    if (selecting && !searching) {
      if (!picked.includes(item.id)) togglePick(item.id, false);
      return selectionMenu(x, y);
    }
    const select: MenuItem[] = searching ? [] : [{ label: 'Select', icon: 'check', run: () => startSelect(item.id) }];
    menu = item.kind === 'link'
      ? { x, y, items: [
          { label: 'Open in new tab', icon: 'external', run: () => bm.openTab(item.url) },
          { label: 'Edit', icon: 'edit', run: () => (edit = { mode: 'edit', id: item.id, title: item.title, url: item.url }) },
          { label: 'Refresh picture', icon: 'refresh', run: () => { forgetPreview(item.url); epoch.n++; } },
          { label: 'Move to', icon: 'move', sub: moveTo(item) },
          ...select,
          'sep',
          { label: 'Delete', icon: 'trash', danger: true, run: () => del(item) },
        ] }
      : { x, y, items: [
          { label: 'Open', icon: 'open', run: () => openFolder(item.id) },
          { label: `Open all (${item.items.filter((i) => i.kind === 'link').length})`, icon: 'tabs', run: () => openAll(item.items, item.title) },
          { label: 'Sort A → Z', icon: 'sort', run: () => sortFolder(item.id, item.title) },
          { label: 'Rename', icon: 'rename', run: () => rename(item) },
          { label: 'Move to', icon: 'move', sub: moveTo(item) },
          ...select,
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
    if (selecting) return selectionMenu(e.clientX, e.clientY);
    const here = view.items.filter((i) => i.kind === 'link').length;
    menu = { x: e.clientX, y: e.clientY, items: [
      { label: 'Add site', icon: 'plus', run: () => (edit = { mode: 'add' }) },
      { label: 'Add open tabs', icon: 'tabs', run: addOpenTabs },
      { label: 'New folder', icon: 'folderPlus', run: newFolder },
      'sep',
      { label: `Open all (${here})`, icon: 'external', run: () => openAll(view.items, view.title), disabled: !here || searching },
      { label: 'Select', icon: 'check', run: () => startSelect(), disabled: !view.items.length || searching },
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

  // ---- drag to reorder, Alt+arrows ----
  // The tile you drag lifts and follows the pointer, solid; where it would land stays open as a soft empty slot, and
  // the other tiles slide aside to make room (like a phone's home screen). Over the middle of a folder a site drops
  // into it; over a folder tab, into that folder. Esc puts it back. Pointer events, not the browser's own drag and drop,
  // whose drag picture is a faded copy that can't be styled.
  let dragged = $state<DialItem | null>(null);
  let dragOrder = $state<string[] | null>(null); // ids in the order shown while dragging
  let intoId = $state<string | null>(null); // folder the dragged site would drop into
  let overTab = $state<string | null>(null); // folder tab the dragged tile would drop into
  // Only the cells' CSS grid order changes while dragging; a short slide (FLIP) animates each tile to its new place.
  const orderOf = (id: string) => (dragOrder ? dragOrder.indexOf(id) : -1);
  let gridEl = $state<HTMLElement>();
  let pageEl = $state<HTMLElement>();
  // Selected tiles carried along with the dragged one: out of the grid while dragging, shown as a stack under the pointer.
  let carried = $state<string[]>([]);
  const reorderTo = (next: string[]) => flip(() => (dragOrder = next));
  /** Makes a change to the grid and slides each tile from where it was to its new place. */
  async function flip(change: () => void) {
    const cells = [...(gridEl?.querySelectorAll<HTMLElement>(':scope > .cell') ?? [])];
    const before = new Map(cells.map((c) => [c, c.getBoundingClientRect()]));
    change();
    await tick();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const c of cells) {
      const a = before.get(c)!, b = c.getBoundingClientRect();
      if (!a.width || !b.width) continue; // hidden before or after (a carried tile)
      if (a.left !== b.left || a.top !== b.top) c.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` }, { transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.2,.7,.3,1)' });
    }
  }
  function hoverDrag(target: string, zone: 'before' | 'after' | 'into') {
    if (!dragged || !dragOrder || target === dragged.id) return;
    if (zone === 'into' && (dragged.kind === 'link' || carried.length)) return void (intoId = target);
    intoId = null;
    const rest = dragOrder.filter((id) => id !== dragged!.id);
    const at = rest.indexOf(target) + (zone === 'after' ? 1 : 0);
    const next = [...rest.slice(0, at), dragged.id, ...rest.slice(at)];
    if (next.join() !== dragOrder.join()) void reorderTo(next);
  }
  /** Which tile slot the pointer is over, by layout position (offsets ignore the slide animations, so a tile sliding
   *  under the pointer doesn't flip the order back and forth). */
  function hoverAt(x: number, y: number) {
    if (!gridEl || !dragged || !dragOrder) return;
    const g = gridEl.getBoundingClientRect(), gx = x - g.left, gy = y - g.top;
    const cells = [...gridEl.querySelectorAll<HTMLElement>(':scope > .cell')];
    const box = (c: HTMLElement) => ({ l: c.offsetLeft - gridEl!.offsetLeft, t: c.offsetTop - gridEl!.offsetTop, w: c.offsetWidth, h: c.offsetHeight });
    for (const c of cells) {
      if (!c.offsetWidth) continue; // a carried tile, out of the grid
      const b = box(c);
      if (gx < b.l || gx > b.l + b.w || gy < b.t || gy > b.t + b.h) continue;
      const id = c.dataset.id!;
      if (id === dragged.id) return void (intoId = null);
      const f = (gx - b.l) / b.w, folder = view.items.find((i) => i.id === id)?.kind === 'folder';
      return hoverDrag(id, folder && f > 0.25 && f < 0.75 ? 'into' : f < 0.5 ? 'before' : 'after');
    }
    // Past the last tile (to its right, or below the last row): the end.
    const last = cells.filter((c) => c.dataset.id !== dragged!.id && c.offsetWidth).map(box).sort((a, b) => a.t - b.t || a.l - b.l).at(-1);
    if (last && (gy > last.t + last.h || (gy >= last.t && gx > last.l + last.w))) {
      intoId = null;
      const next = [...dragOrder.filter((id) => id !== dragged!.id), dragged.id];
      if (next.join() !== dragOrder.join()) void reorderTo(next);
    }
  }
  // The lifted tile: a copy of the card that follows the pointer (the real one stays in the grid as the empty slot).
  let ghost: HTMLElement | null = null;
  let grab = { dx: 0, dy: 0 };
  let edgeScroll = 0;
  let settling: ReturnType<typeof setTimeout> | undefined;
  const SMALL = 0.42; // the lifted tile's size over a folder tab (.dragghost.small)
  function grabTile(item: DialItem, e: PointerEvent, el: HTMLElement) {
    if (searching || e.button !== 0 || e.pointerType === 'touch' || (e.target as Element).closest('.more')) return;
    const x0 = e.clientX, y0 = e.clientY;
    let started = false;
    const move = (m: PointerEvent) => {
      if (!started) {
        if (Math.hypot(m.clientX - x0, m.clientY - y0) < 6) return; // a click, not a drag (yet)
        started = true;
        const r = el.getBoundingClientRect();
        grab = { dx: x0 - r.left, dy: y0 - r.top };
        // Dragging a selected tile drags the whole selection.
        const others = selecting && picked.includes(item.id) ? view.items.filter((i) => picked.includes(i.id) && i.id !== item.id).map((i) => i.id) : [];
        ghost = liftedStack(el, others);
        Object.assign(ghost.style, { width: `${r.width}px`, height: `${r.height}px`, transformOrigin: `${grab.dx}px ${grab.dy}px` });
        pageEl?.append(ghost);
        void flip(() => {
          dragged = item;
          carried = others;
          dragOrder = view.items.map((i) => i.id);
        });
        document.documentElement.classList.add('om-dragging');
      }
      m.preventDefault();
      const under = document.elementFromPoint(m.clientX, m.clientY);
      overTab = under?.closest<HTMLElement>('.tabs button[data-tab]')?.dataset.tab ?? null;
      // Over a folder tab the tile shrinks to a thumbnail just below and right of the pointer, so the tab stays
      // readable; elsewhere the point you grabbed stays under the pointer. (The change between the two glides.)
      const small = !!overTab;
      if (ghost!.classList.contains('small') !== small) {
        ghost!.classList.toggle('small', small);
        ghost!.classList.add('settling');
        clearTimeout(settling);
        settling = setTimeout(() => ghost?.classList.remove('settling'), 180);
      }
      // `scale` works around transform-origin (the grabbed point), so a shrunk tile's corner is (1 − s) of the way there.
      const [x, y] = small
        ? [m.clientX + 14 - grab.dx * (1 - SMALL), m.clientY + 18 - grab.dy * (1 - SMALL)]
        : [m.clientX - grab.dx, m.clientY - grab.dy];
      ghost!.style.translate = `${x}px ${y}px`;
      if (overTab) intoId = null;
      else hoverAt(m.clientX, m.clientY);
      // Near the top or bottom edge, the tiles scroll.
      const s = scrollEl?.getBoundingClientRect();
      edgeScroll = s ? (m.clientY < s.top + 40 ? -12 : m.clientY > s.bottom - 40 ? 12 : 0) : 0;
    };
    const stop = (ok: boolean, byKey = false) => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('keydown', esc, true);
      if (!started) return;
      edgeScroll = 0;
      document.documentElement.classList.remove('om-dragging');
      // The click that ends a drag must not open (or, while selecting, pick) the tile; after Esc that click comes
      // later, when the button is let go.
      const eat = (c: Event) => { c.preventDefault(); c.stopPropagation(); };
      const arm = () => {
        addEventListener('click', eat, { capture: true, once: true });
        setTimeout(() => removeEventListener('click', eat, true), 0);
      };
      if (byKey) addEventListener('pointerup', arm, { capture: true, once: true });
      else arm();
      void drop(ok);
    };
    const up = () => stop(true);
    const esc = (k: KeyboardEvent) => { if (k.key === 'Escape') { k.preventDefault(); k.stopPropagation(); stop(false, true); } };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('keydown', esc, true);
  }
  $effect(() => {
    if (!dragged) return;
    const t = setInterval(() => { if (edgeScroll && scrollEl) { scrollEl.scrollTop += edgeScroll; measure(); } }, 16);
    return () => clearInterval(t);
  });
  /** What follows the pointer: a copy of the tile, with up to two of the other selected tiles fanned out behind it and
   *  a count when several are carried. */
  function liftedStack(el: HTMLElement, others: string[]): HTMLElement {
    const copy = (src: HTMLElement) => {
      const c = src.cloneNode(true) as HTMLElement;
      c.removeAttribute('href');
      c.classList.remove('picked', 'lifted', 'active');
      c.querySelectorAll('.tick, .more').forEach((t) => t.remove());
      return c;
    };
    const stack = document.createElement('div');
    stack.className = 'dragghost';
    others.slice(0, 2).forEach((id, i) => {
      const src = gridEl?.querySelector<HTMLElement>(`:scope > .cell[data-id="${id}"] > *`);
      if (!src) return;
      const c = copy(src);
      c.style.transform = `translate(${(i + 1) * 8}px, ${(i + 1) * 6}px) rotate(${(i + 1) * 3}deg)`;
      stack.prepend(c);
    });
    stack.append(copy(el));
    if (others.length) {
      const n = document.createElement('span');
      n.className = 'dragcount';
      n.textContent = String(others.length + 1);
      stack.append(n);
    }
    return stack;
  }
  /** Moves tiles within the open folder so they sit together in `order` (the order shown when they were dropped). */
  async function placeTogether(ids: string[], order: string[]) {
    const anchor = order.slice(order.indexOf(ids.at(-1)!) + 1).find((id) => !ids.includes(id)); // first tile after them
    for (const id of ids) {
      const now = (await bm.children(folderId)).map((n) => n.id);
      await bm.move(id, folderId, anchor ? now.indexOf(anchor) : now.length);
    }
  }
  /** Ends a drag: the lifted tile settles into its slot (or flies back), then the move is saved. */
  async function drop(ok: boolean) {
    const d = dragged, order = dragOrder, into = intoId, tab = tabs.find((t) => t.id === overTab), group = carried;
    const g = ghost;
    ghost = null;
    const keep = ok && !into && !tab; // the tile lands in its slot in the grid
    // Back to the grid: the carried tiles return around the dropped one (or to where they were, when cancelled).
    const groupIds = d ? view.items.filter((i) => i.id === d.id || group.includes(i.id)).map((i) => i.id) : [];
    const landed = d && order && group.length && keep
      ? (() => { const rest = order.filter((id) => !group.includes(id)), at = rest.indexOf(d.id); return [...rest.slice(0, at).filter((id) => id !== d.id), ...groupIds, ...rest.slice(at + 1)]; })()
      : null;
    if (!ok || landed) await flip(() => { dragOrder = landed ?? view.items.map((i) => i.id); carried = []; });
    else await tick();
    const slot = d && gridEl?.querySelector<HTMLElement>(`:scope > .cell[data-id="${d.id}"]`);
    if (g && slot && (keep || !ok) && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const r = slot.getBoundingClientRect();
      await g.animate([{ translate: g.style.translate }, { translate: `${r.left}px ${r.top}px` }], { duration: 160, easing: 'cubic-bezier(.2,.7,.3,1)' }).finished.catch(() => {});

    }
    g?.remove();
    dragged = null;
    overTab = null;
    intoId = null;
    if (!d || !order || !ok) return void (dragOrder = null, carried = []);
    // Into a folder (its tab, or the middle of its tile): the whole selection when a selected tile was dragged.
    const target = tab ? (tab.id === 'home' ? dial.id : tab.id) : into;
    if (target) {
      const label = tab?.label ?? view.items.find((i) => i.id === into)?.title ?? 'folder';
      if (target === folderId) return void (dragOrder = null, carried = []);
      if (group.length) await moveMany(view.items.filter((i) => groupIds.includes(i.id)), target, label);
      else await bm.move(d.id, target);
      dragOrder = null;
      carried = [];
      return;
    }
    if (landed) {
      await placeTogether(groupIds, landed);
      setTimeout(() => { if (!dragged) dragOrder = null; }, 1500);
      return;
    }
    const from = view.items.findIndex((i) => i.id === d.id), to = order.indexOf(d.id);
    if (to === from) return void (dragOrder = null);
    // The shown order stays until the bookmarks come back in it, so the tiles don't jump back for a moment.
    await bm.move(d.id, folderId, to > from ? to + 1 : to);
    setTimeout(() => { if (!dragged) dragOrder = null; }, 1500);
  }
  $effect(() => {
    const ids = view.items.map((i) => i.id).join();
    if (!dragged && dragOrder && dragOrder.join() === ids) dragOrder = null;
  });
  // Folder tabs: drag a tab onto another to reorder folders (a tile dropped on a tab is handled by the tile drag).
  let draggedTab = $state<string | null>(null);
  async function dropOnTab(t: (typeof tabs)[number]) {
    if (!draggedTab) return;
    const from = dial.items.findIndex((i) => i.id === draggedTab), to = dial.items.findIndex((i) => i.id === t.id);
    if (from >= 0 && to >= 0 && from !== to) await bm.move(draggedTab, dial.id, to > from ? to + 1 : to);
    draggedTab = null;
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
  // Your picture, read from storage when it's chosen (at start, or again from Settings) and no local copy is drawn.
  $effect(() => {
    if (prefs.wallpaper.kind === 'image' && !wallpaper && snap?.src !== 'upload') loadWallpaper().then((u) => (wallpaper = u)).catch(() => {});
  });
  async function setWallpaper(f: File) {
    // The new picture is shown (and its screen-sized copy made) at once, while it's saved. Waiting for the save first
    // left the old picture current meanwhile, and its copy was made again and kept in place of the new one.
    dropSnap();
    snap = null;
    wallpaper = URL.createObjectURL(f);
    prefs.wallpaper = { kind: 'image' };
    await saveWallpaper(f);
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

  // The clock: "Tue Apr 25 5:20 PM", turning over right as the minute does.
  let now = $state(new Date());
  const tickClock = () => {
    now = new Date();
    setTimeout(tickClock, 60_000 - (Date.now() % 60_000) + 50);
  };
  setTimeout(tickClock, 60_000 - (Date.now() % 60_000) + 50);
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const clock = $derived.by(() => {
    const h = now.getHours(), two = (n: number) => String(n).padStart(2, '0');
    return `${DAYS[now.getDay()]} ${MONTHS[now.getMonth()]} ${now.getDate()} ${h % 12 || 12}:${two(now.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
  });
  let systemDark = $state(matchMedia('(prefers-color-scheme: dark)').matches);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => (systemDark = e.matches));
  const theme = $derived(themeById(prefs.themeId, ownThemes.list));
  // A theme from your own CSS file may bring rules besides its colours: they go in the page's head while it's on.
  $effect(() => {
    const css = theme.css;
    if (!css) return;
    const el = document.head.appendChild(document.createElement('style'));
    el.dataset.openmarksTheme = theme.id;
    el.textContent = css;
    return () => el.remove();
  });
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
    // A copy that finishes after its picture was replaced is dropped (the new picture's own copy follows).
    const current = () => (w.kind === 'image' ? wallpaper : daily?.url);
    if (src && from && snap?.src !== src) makeSnap(src, from).then((s) => { if (s && current() === from) keepSnap((snap = s)); });


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
  const isFirstRun = $derived(dial.items.length === 0);
  const searchEngine = $derived(engineById(prefs.engine, prefs.engines));
  // Nothing beside the folder tabs (search is the bar below them, no clock): they sit in the middle.
  // The search bar sits in the middle of the folder row; when the folder tabs would run into it, the bar takes a row
  // of its own under them and the tabs move to the middle (always so on a phone). Measured: the tabs' full width
  // against the room left of a centred bar, again whenever folders, the window or the setting change.
  let barinEl = $state<HTMLElement>(), tabpillEl = $state<HTMLElement>(), tabsNavEl = $state<HTMLElement>();
  let stacked = $state(false);
  const BAR_W = 380;
  function fitBar() {
    if (prefs.searchStyle !== 'bar' || !barinEl || !tabpillEl || !tabsNavEl) return;
    if (form === 'phone') return void (stacked = true);
    const tabsW = tabsNavEl.scrollWidth + (tabpillEl.offsetWidth - tabsNavEl.clientWidth); // whole, even while it scrolls
    stacked = tabsW > (barinEl.clientWidth - BAR_W) / 2 - 16;
  }
  $effect(() => {
    void tabs; void namingFolder; void prefs.searchStyle; void prefs.clock; void form;
    tick().then(fitBar);
  });
  $effect(() => {
    if (!barinEl) return;
    const ro = new ResizeObserver(() => fitBar());
    ro.observe(barinEl);
    return () => ro.disconnect();
  });
  const folderLabel = $derived(prefs.dialFolder ? dial.title : 'Openmarks');
  const iconMode = $derived(prefs.tileSize === 'icon');
</script>

<svelte:window {onpaste} onkeydown={pageKeys} onmousemove={() => (navving = false)} oncontextmenu={pageMenu} bind:innerWidth={winW} />

<div
  bind:this={pageEl} class="page" class:dark class:on-photo={onPhoto}
  style={vars} data-form={form} style:--side="{side}px" style:--tile="{tileW}px" style:--cols={cols} style:--gap="{gap}px" style:--row-gap="{iconMode ? 30 : gap}px" style:--font="{fixed.fontSize}px" style:--wrap="{wrapW}px"
  style:background={bg} class:navving class:solid={!prefs.glass} role="presentation"
>
  <header class="bar">
    <div class="barin" bind:this={barinEl} class:withbar={prefs.searchStyle === 'bar'} class:stacked={prefs.searchStyle === 'bar' && stacked}>
      <div class="tabpill" bind:this={tabpillEl}>
      <nav class="tabs" bind:this={tabsNavEl} aria-label="Folders">
        {#each tabs as t (t.id)}
          <button
            aria-current={t.id === selected ? 'page' : undefined} class:on={t.id === selected}
            data-tab={t.id} class:droptab={overTab === t.id}
            onclick={() => selectTab(t.id)} oncontextmenu={(e) => tabMenu(e, t)}
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

      {#if prefs.searchStyle === 'bar'}
        <!-- Search as a bar, slim like GNOME's search entry: beside the folder tabs, the two centred together; on a row of
             its own under them when the folders leave no room. Clicking it (or "/", or just typing) grows it into the
             search panel in place; while that's open the bar is the panel, so it isn't drawn here. -->
        <button class="searchbar" bind:this={barEl} style:visibility={spot !== null ? 'hidden' : undefined}
          aria-label="Search (press /)" aria-keyshortcuts="/" onclick={() => openSearch()}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <span class="ph">Search</span>
          <span class="engine" title="Search engine (change it in Settings › Page)"><EngineIcon engine={searchEngine} size={14} />{searchEngine.name}</span>
          <kbd aria-hidden="true">/</kbd>
        </button>
      {/if}

      <div class="corner">
        {#if prefs.clock && form !== 'phone'}<span class="clock">{clock}</span>{/if}
        {#if prefs.searchStyle === 'icon'}
          <div class="search">
            <span class="tip" aria-hidden="true">Search <kbd>/</kbd></span>
            <button type="button" class="ibtn" bind:this={searchBtn} aria-label="Search (press /)" aria-keyshortcuts="/" onclick={() => openSearch()}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            </button>
          </div>
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

    {#if crumbs.length}
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
    {:else if view.items.length === 0}
      <p class="none">This folder is empty. Paste a link here or add one.</p>
      {#if prefs.addButton}<button class="add solo" aria-label="Add site" onclick={() => (edit = { mode: 'add' })}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d={icons.plus} /></svg></button>{/if}
    {:else}
      <main class="grid" bind:this={gridEl} aria-label={view.title}>
        {#each view.items as item (item.id)}
          <!-- While selecting, a click (or Enter) picks the tile instead of opening it; Shift+click starts selecting,
               and then picks everything from the last tile picked. -->
          <div class="cell" class:slot={dragged?.id === item.id} class:carried={carried.includes(item.id)} data-id={item.id} role="presentation" style:order={dragOrder ? orderOf(item.id) : undefined}
            onclickcapture={(e) => {
              if (!selecting && !e.shiftKey) return;
              e.preventDefault();
              e.stopPropagation();
              if (selecting) togglePick(item.id, e.shiftKey);
              else startSelect(item.id);
            }}>

            <Card {item} {dark} onopen={openFolder} onmenu={tileMenu} onmove={step} ongrab={grabTile}
              into={intoId === item.id} lifted={dragged?.id === item.id}
              {selecting} picked={picked.includes(item.id)} />
          </div>
        {/each}
        {#if prefs.addButton && !dragged}
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

  {#if selecting}
    <div class="selbar" role="toolbar" aria-label="Selected items">
      <span class="count">{picked.length ? `${picked.length} selected` : 'Click tiles to select'}</span>
      <button disabled={!picked.length} onclick={(e) => { const r = e.currentTarget.getBoundingClientRect(); menu = { x: r.left, y: r.top - 8, items: moveManyTo(pickedItems), above: true }; }}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={icons.move} /></svg>Move to
      </button>
      <button disabled={!pickedItems.some((i) => i.kind === 'link')} onclick={() => openAll(pickedItems, plural(pickedItems.length, 'selected item'))}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={icons.external} /></svg>Open
      </button>
      <button class="danger" disabled={!picked.length} onclick={() => delMany(pickedItems)}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={icons.trash} /></svg>Delete
      </button>
      <button class="done" onclick={endSelect}>Done</button>
    </div>
  {/if}

  <div class="toasts" class:lift={selecting} role="status" aria-live="polite">
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
  {#if spot !== null}<Spotlight bind:this={spotRef} initial={spot} from={spotFrom} dial={everything} dialId={dial.id} onfolder={openFolder} onclose={() => (spot = null)} />{/if}
  {#if pickEngine}<EnginePicker onclose={() => (pickEngine = false)} />{/if}
  {#if sheet}<SettingsSheet {dark} oncaptureall={captureAll} {folderLabel} {daily} onrefreshdaily={() => loadDaily(true)} onclose={() => (sheet = false)} onpickfolder={() => (pickFolder = true)} onpickengine={() => (pickEngine = true)} onwallpaper={setWallpaper} />{/if}
</div>

<style>
  /* Colours, corners, type and glass come from the theme engine (themes.ts) as CSS variables on .page. */
  .page {
    min-height: 100vh; color: var(--text); background: var(--bg); background-attachment: fixed;
    font: 14px/1.4 var(--font-family);
  }
  /* The bar never overlaps the tiles: tiles scroll in their own area and fade out softly at its top edge. */
  .page { height: 100vh; display: flex; flex-direction: column; overflow: hidden; position: relative; }
  /* One hover language, used by every component:
     - things you press (buttons, tabs, menu items, rows): a soft tint of the text colour on hover, a stronger one while
       pressed, and small buttons give a little under the pointer;
     - choices (option cards, presets, pictures): a faint accent outline on hover, the preview of the full outline a
       chosen one has;
     - tiles: each theme's own hover (lift, glow, lit title), plus a press.
     All on the same quick ease; none of it with reduced motion (see the rule at the end). */
  .page {
    --tint: color-mix(in srgb, var(--text) 7%, transparent);
    --tint-press: color-mix(in srgb, var(--text) 13%, transparent);
    --choice-hover: color-mix(in srgb, var(--ring) 40%, transparent);
    --ease: cubic-bezier(0.2, 0.7, 0.3, 1);
    --quick: 0.14s;
  }
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
  .newfolder { transition: background var(--quick) var(--ease), color var(--quick) var(--ease), opacity var(--quick) var(--ease), transform 0.08s var(--ease); }
  .newfolder:hover, .newfolder:focus-visible { opacity: 1; background: var(--tint); color: var(--text); }
  .newfolder:active { background: var(--tint-press); transform: scale(0.94); }
  .search { position: relative; height: 38px; box-sizing: border-box; border-radius: 999px; }
  .tip { position: absolute; right: calc(100% + 8px); top: 50%; transform: translateY(-50%); white-space: nowrap; pointer-events: none;
    padding: 4px 8px; border-radius: 6px; background: var(--float); backdrop-filter: var(--float-blur); color: var(--muted); font-size: 12px; box-shadow: var(--shadow); opacity: 0; transition: opacity 0.12s 0.25s; }
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
  /* The folder row: the tabs (they scroll sideways when they don't fit), the search bar, the clock or search button.
     It wraps: the bar moves to a row of its own when the tabs leave it no room. */
  .barin { display: flex; align-items: center; gap: 16px; padding: 11px 0; box-sizing: border-box; }
  .barin .tabpill { flex: 0 1 auto; margin-right: auto; }
  /* With the search bar: folder tabs on the left, the bar in the middle of the row, the clock on the right; or (stacked)
     the tabs in the middle and the bar centred on a row under them, the clock beside it. */
  .barin.withbar { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 8px 16px; }
  .barin.withbar .tabpill { grid-column: 1; justify-self: start; margin: 0; max-width: 100%; }
  .barin.withbar .searchbar { grid-column: 2; grid-row: 1; }
  .barin.withbar .corner { grid-column: 3; grid-row: 1; justify-self: end; }
  .barin.withbar.stacked .tabpill { grid-column: 1 / -1; justify-self: center; }
  .barin.withbar.stacked .searchbar, .barin.withbar.stacked .corner { grid-row: 2; }
  .tabs { display: flex; gap: 2px; overflow-x: auto; scrollbar-width: none; min-width: 0; mask-image: linear-gradient(to right, #000 calc(100% - 16px), transparent); padding-right: 12px; }
  .tabs::-webkit-scrollbar { display: none; }
  .tabs button { flex: none; border: 0; background: none; color: var(--muted); font: inherit; cursor: pointer; padding: 6px 10px; border-radius: var(--radius-sm); white-space: nowrap;
    text-transform: uppercase; letter-spacing: 0.04em; }
  .tabs button { transition: background var(--quick) var(--ease), color var(--quick) var(--ease); }
  .tabs button:hover { color: var(--text); background: var(--tint); }
  .tabs button:active { background: var(--tint-press); }
  .tabs button.on { color: var(--text); font-weight: var(--tab-weight); }
  .corner { flex: none; display: flex; align-items: center; gap: 8px; }
  .clock { font-variant-numeric: tabular-nums; color: var(--muted); padding: 0 12px; white-space: nowrap; }
  .ibtn { flex: none; display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: 50%; background: none; color: var(--muted); cursor: pointer; }
  .gearfab { position: fixed; right: 20px; bottom: 20px; z-index: 20; width: 40px; height: 40px; display: grid; place-items: center; padding: 0;
    border-radius: 50%; border: var(--border); background: var(--pane); backdrop-filter: var(--backdrop);
    color: var(--muted); cursor: pointer; opacity: 0.75; transition: opacity 0.14s, background 0.14s, color 0.14s, box-shadow 0.14s, transform 0.3s; }
  .gearfab:hover, .gearfab:focus-visible, .gearfab[aria-expanded='true'] { opacity: 1; background: var(--hover-title-bg); color: var(--hover-title-text); box-shadow: var(--hover-shadow); border-color: var(--hover-edge); }
  .gearfab:hover svg { transform: rotate(45deg); }
  .gearfab:active { transform: scale(0.93); }
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
  .addpill:active { filter: brightness(0.94); }
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
  .ibtn { transition: background var(--quick) var(--ease), color var(--quick) var(--ease), transform 0.08s var(--ease); }
  .ibtn:hover { color: var(--text); background: var(--tint); }
  .ibtn:active { background: var(--tint-press); transform: scale(0.94); }

  .search { display: flex; align-items: center; transition: background 0.18s; }
  /* The search bar: a slim pill like GNOME's search entry, as tall as the folder tabs and on the same pane, centred
     at the top. The search panel grows out of it (Spotlight.svelte). */
  .searchbar { width: 380px; max-width: 100%; height: 38px; box-sizing: border-box; display: flex; align-items: center; gap: 10px; padding: 0 8px 0 14px;
    border: var(--border); border-radius: 999px; background: var(--pane); backdrop-filter: var(--backdrop); box-shadow: var(--shadow);
    color: var(--muted); font: inherit; font-size: 14px; text-align: left; cursor: text;
    transition: border-color var(--quick) var(--ease), box-shadow var(--quick) var(--ease), color var(--quick) var(--ease); }
  .searchbar svg { flex: none; }
  .searchbar .ph { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .searchbar kbd { flex: none; opacity: 0.8; }
  .searchbar .engine { flex: none; display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--muted); white-space: nowrap; }
  .searchbar:hover { color: var(--text); border-color: var(--choice-hover); box-shadow: var(--shadow), 0 0 0 3px color-mix(in srgb, var(--ring) 12%, transparent); }
  .page[data-form='phone'] .barin.withbar .searchbar { grid-column: 1 / -1; width: 100%; } /* a phone has no room beside the tabs */
  .page[data-form='phone'] .searchbar kbd { display: none; }
  kbd { font: 11px ui-monospace, monospace; color: var(--muted); border: 1px solid var(--line); border-radius: 4px; padding: 0 5px; }

  .banner { display: flex; gap: 12px; align-items: center; padding: 8px 14px; border-radius: 999px; background: var(--surface); border: 1px solid var(--line); font-size: 13px; margin-top: 4px; }
  .banner span { flex: 1; color: var(--muted); }
  .banner button { border: 0; background: var(--ring); color: var(--on-ring); border-radius: 999px; padding: 5px 12px; font: 600 12px system-ui; cursor: pointer; }
  .crumbs { display: flex; align-items: center; gap: 2px; margin: 8px 0 0 -10px; color: var(--muted); }
  .crumbs button { border: 0; background: none; color: inherit; font: inherit; cursor: pointer; padding: 4px 10px; border-radius: 6px; }
  .crumbs button { transition: background var(--quick) var(--ease), color var(--quick) var(--ease); }
  .crumbs button:hover { color: var(--text); background: var(--tint); }
  .crumbs button:active { background: var(--tint-press); }
  .grid { display: grid; grid-template-columns: repeat(var(--cols), var(--tile)); gap: var(--row-gap) var(--gap); margin-top: 20px; }
  .none { margin: 48px auto 0; max-width: 420px; text-align: center; color: var(--muted); line-height: 1.5; }
  .on-photo .none, .on-photo .first { background: var(--pane); backdrop-filter: var(--backdrop); border-radius: 12px; padding: 12px 16px; }
  .first { margin: 12vh auto 0; max-width: 520px; text-align: center; }
  .first h1 { font-size: 18px; font-weight: 600; margin: 0 0 18px; }
  .first p { margin: 16px 0 0; color: var(--muted); font-size: 13px; }
  .choices { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .choice { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 18px 12px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--text); font: inherit; font-size: 13px; cursor: pointer; box-shadow: var(--shadow); }
  .choice svg { color: var(--muted); }
  .choice { transition: border-color var(--quick) var(--ease), transform var(--quick) var(--ease), box-shadow var(--quick) var(--ease); }
  .choice:hover { border-color: var(--choice-hover); transform: translateY(-2px); box-shadow: var(--hover-shadow); }
  .choice:hover svg { color: var(--text); }
  .choice:active { transform: scale(0.98); }
  .toasts { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); display: flex; flex-direction: column; gap: 8px; align-items: center; z-index: 40; }
  .toasts.lift { bottom: 84px; }
  .selbar { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); z-index: 41; display: flex; align-items: center; gap: 2px; max-width: calc(100vw - 32px); box-sizing: border-box;
    padding: 5px; border-radius: 999px; border: 1px solid var(--line); background: color-mix(in srgb, var(--surface) var(--float-alpha), transparent); backdrop-filter: var(--float-blur);
    box-shadow: 0 8px 28px rgb(0 0 0 / 0.22); font-size: 13px; white-space: nowrap; }
  .selbar .count { padding: 0 12px 0 10px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .selbar button { display: flex; align-items: center; gap: 6px; padding: 7px 12px; border: 0; border-radius: 999px; background: none; color: var(--text); font: inherit; cursor: pointer; }
  .selbar button { transition: background var(--quick) var(--ease), transform 0.08s var(--ease); }
  .selbar button:hover:not([disabled]) { background: var(--tint); }
  .selbar button:active:not([disabled]) { background: var(--tint-press); transform: scale(0.96); }
  .selbar button[disabled] { opacity: 0.4; cursor: default; }
  .selbar button svg { color: var(--muted); }
  .selbar .danger, .selbar .danger svg { color: var(--danger); }
  .selbar .done { margin-left: 4px; background: var(--ring); color: var(--on-ring); font-weight: 600; }
  .selbar .done:hover { background: var(--ring) !important; filter: brightness(1.08); }
  .page[data-form='phone'] .selbar .count { display: none; }

  .toast { display: flex; gap: 16px; align-items: center; padding: 9px 14px; border-radius: 999px; background: color-mix(in srgb, #1f2328 var(--float-alpha), transparent); backdrop-filter: var(--float-blur); color: #f5f6f8; box-shadow: 0 8px 24px rgb(0 0 0 / 0.25); font-size: 13px; }
  .dark .toast { background: color-mix(in srgb, #e8e9ec var(--float-alpha), transparent); color: #18191c; }
  .toast button { border: 0; background: none; color: #8fb0ff; font: 600 13px system-ui; cursor: pointer; }
  .dark .toast button { color: #2453c9; }
  @media (prefers-reduced-motion: reduce) { :global(*) { transition: none !important; animation: none !important; } }

  /* ── Phones and tablets ── */
  .page[data-form='phone'] .barin { padding: 7px 0; gap: 8px; }
  .page[data-form='phone'] .grid { margin-top: 12px; }
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
  /* Dragging a tile: the lifted copy follows the pointer above everything, solid, raised a little; its place in the grid
     is a soft empty slot. */
  :global(.dragghost) { position: fixed; z-index: 60; left: 0; top: 0; pointer-events: none; scale: 1.04; transition: scale 0.15s ease; }
  :global(.dragghost.small) { scale: 0.42; }
  :global(.dragghost.settling) { transition: scale 0.15s ease, translate 0.15s ease; }

  :global(.dragghost > .card), :global(.dragghost > .icon-tile) { position: absolute !important; inset: 0; width: 100%; height: 100%; margin: 0; box-sizing: border-box;
    transition: none !important; opacity: 1 !important; visibility: visible !important; outline: none !important; }
  :global(.dragghost > .card) { box-shadow: 0 18px 40px rgb(0 0 0 / 0.28), 0 4px 12px rgb(0 0 0 / 0.18) !important; }
  /* Solid even with Transparency on: nothing shows through the tiles you're holding. */
  :global(.dragghost > .card), :global(.dragghost .cap), :global(.dragghost .sq) { background: var(--surface) !important; backdrop-filter: none !important; }
  :global(.dragghost .icon-tile .sq) { box-shadow: 0 14px 30px rgb(0 0 0 / 0.3); }
  :global(.dragcount) { position: absolute; z-index: 1; top: -10px; right: -10px; min-width: 26px; height: 26px; padding: 0 8px; box-sizing: border-box; display: grid; place-items: center;
    border-radius: 13px; background: var(--ring); color: var(--on-ring); font: 700 13px/1 system-ui, sans-serif; box-shadow: 0 2px 8px rgb(0 0 0 / 0.3); }
  .cell.carried { display: none; }


  :global(html.om-dragging), :global(html.om-dragging *) { cursor: grabbing !important; user-select: none; }
  .cell.slot { border-radius: var(--radius); background: color-mix(in srgb, var(--text) 7%, transparent); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--text) 14%, transparent); }
  .tabs button.droptab { color: var(--text); box-shadow: inset 0 0 0 2px var(--ring); background: color-mix(in srgb, var(--ring) 14%, transparent); }
  .cell { min-width: 0; display: flex; }

  .cell > :global(*) { flex: 1; min-width: 0; }
</style>
