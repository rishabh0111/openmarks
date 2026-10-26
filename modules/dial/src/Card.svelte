<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- A dial tile. Card sizes (S–XL): Vivaldi-style card, picture on top, caption inside the card.
     Icon size: Vivaldi's icon mode, a rounded square with the site's icon and the title below.
     Titles: show / on hover / hide. Right-click, ContextMenu, Shift+F10 or ⋯ open the menu; Alt+←/→ moves; drag to reorder.
     While several tiles are being selected each shows a check in its corner (Shell decides what a click does). -->
<script lang="ts">
  import type { DialItem } from '@openmarks/module-sdk';
  import CardThumb from './CardThumb.svelte';
  import MiniIcon from './MiniIcon.svelte';
  import { host } from './shared';
  import { pictures } from './pictures.svelte';
  import { prefs } from './prefs.svelte';

  let {
    item, dark, where, active = false, into = false, lifted = false, selecting = false, picked = false, onopen, onmenu, onmove, ongrab,
  }: {
    item: DialItem; dark: boolean; where?: string; active?: boolean;
    selecting?: boolean; // tiles are being selected: show a check on each
    picked?: boolean; // this tile is one of them
    into?: boolean; // a site is about to be dropped into this folder
    lifted?: boolean; // this tile is being dragged: a copy follows the pointer, this one leaves its slot empty
    /** Pointer down on the tile: Shell turns it into a drag once the pointer moves. */
    ongrab?: (item: DialItem, e: PointerEvent, el: HTMLElement) => void;
    onopen: (id: string) => void;
    onmenu: (x: number, y: number, item: DialItem) => void;
    onmove: (item: DialItem, step: -1 | 1) => void;
  } = $props();

  const iconMode = $derived(prefs.tileSize === 'icon');
  const label = $derived(item.kind === 'link' ? item.title || host(item.url) : item.title);

  function keys(e: KeyboardEvent) {
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      onmenu(r.left + 12, r.top + 12, item);
    } else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      onmove(item, e.key === 'ArrowLeft' ? -1 : 1);
    }
  }
  function more(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onmenu(r.left, r.bottom + 4, item);
  }
  const common = $derived({
    'data-id': item.id,
    oncontextmenu: (e: MouseEvent) => { e.preventDefault(); onmenu(e.clientX, e.clientY, item); },
    onkeydown: keys,
    // The browser's own drag (of the link or its picture) would fight Shell's: tiles are dragged with the pointer.
    draggable: false,
    ondragstart: (e: DragEvent) => e.preventDefault(),
    onpointerdown: (e: PointerEvent) => ongrab?.(item, e, e.currentTarget as HTMLElement),
  });
</script>

{#snippet visual()}
  {#if item.kind === 'link'}
    {#key item.url}<CardThumb url={item.url} title={item.title} picture={pictures[item.id]} {dark} iconOnly={iconMode} />{/key}
  {:else}
    <span class="mini">
      {#each item.items.filter((i) => i.kind === 'link').slice(0, 4) as s (s.id)}
        <span class="m">{#if s.kind === 'link'}<MiniIcon url={s.url} title={s.title} />{/if}</span>
      {/each}
      {#if item.items.length === 0}<span class="empty">Empty</span>{/if}
    </span>
  {/if}
{/snippet}

{#snippet tick()}
  {#if selecting}
    <span class="tick" class:on={picked} aria-hidden="true">
      {#if picked}<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>{/if}
    </span>
  {/if}
{/snippet}

{#if iconMode}
  <svelte:element this={item.kind === 'link' ? 'a' : 'button'} class="icon-tile titles-{prefs.titles}" class:over={into} class:lifted class:active class:picked
    href={item.kind === 'link' ? item.url : undefined} onclick={item.kind === 'folder' ? () => onopen(item.id) : undefined}
    aria-label={picked ? `${label}, selected` : label} {...common}>
    <span class="sq">{@render visual()}{@render tick()}</span>
    {#if prefs.titles !== 'hide'}<span class="lbl">{label}</span>{/if}
  </svelte:element>
{:else}
  <svelte:element this={item.kind === 'link' ? 'a' : 'button'} class="card titles-{prefs.titles}" class:over={into} class:lifted class:active class:picked
    href={item.kind === 'link' ? item.url : undefined} onclick={item.kind === 'folder' ? () => onopen(item.id) : undefined}
    aria-label={picked ? `${label}, selected` : label} {...common}>
    <span class="thumb">{@render visual()}{@render tick()}</span>
    {#if prefs.titles !== 'hide'}
      <span class="cap"><span class="t">{label}</span>{#if where}<small>{where}</small>{:else if item.kind === 'folder'}<small>{item.items.length}</small>{/if}</span>
    {/if}
    {#if item.kind === 'link' && !selecting}
      <button class="more" tabindex="-1" aria-label="More actions" onclick={more}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
      </button>
    {/if}
  </svelte:element>
{/if}

<style>
  .card, .icon-tile { position: relative; text-decoration: none; color: var(--text); font: inherit; padding: 0; cursor: pointer; text-align: left; }
  .card {
    display: flex; flex-direction: column; width: 100%; border-radius: var(--radius); overflow: hidden;
    background: var(--pane); backdrop-filter: var(--backdrop); clip-path: var(--notch);
    border: var(--border); box-shadow: var(--shadow); transition: transform 0.16s var(--ease), box-shadow 0.16s var(--ease), border-color 0.16s var(--ease);
  }
  /* Pressed: the tile settles back down and gives a little, at once. */
  /* (:active:hover, so it wins over the theme's hover rule below.) */
  .card:active, .card:active:hover { transform: scale(0.985); box-shadow: var(--shadow); transition-duration: 0.06s; }
  /* Hover is the theme's: lift, grow, glow, edge colour, and (some themes) a lit-up title bar. */
  .card:hover { transform: translateY(var(--hover-lift)) scale(var(--hover-scale)); box-shadow: var(--hover-shadow); border-color: var(--hover-edge); }
  .card:hover .cap, .card:focus-visible .cap { background: var(--hover-title-bg); color: var(--hover-title-text); text-shadow: none; }
  .card:hover .cap small { color: inherit; opacity: 0.8; }
  .card:focus-visible, .card.active, .icon-tile:focus-visible .sq, .icon-tile.active .sq { outline: 2px solid var(--ring); outline-offset: 2px; }
  .card.over, .icon-tile.over .sq { outline: 2px dashed var(--ring); outline-offset: 2px; }
  .thumb { position: relative; aspect-ratio: 16 / 10; display: grid; place-items: center; overflow: hidden; background: var(--plate); }
  .cap { text-shadow: var(--text-shadow); transition: background 0.14s, color 0.14s; display: flex; align-items: baseline; gap: 8px; padding: 9px 12px; min-width: 0; border-top: 1px solid var(--line); font-size: var(--font); line-height: 1.3; }
  .titles-hover .cap { position: absolute; left: 0; right: 0; bottom: 0; background: var(--pane); backdrop-filter: var(--backdrop); opacity: 0; transition: opacity 0.12s; }
  .titles-hover:hover .cap, .titles-hover:focus-visible .cap { opacity: 1; }
  .t { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .cap small { margin-left: auto; color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 45%; }
  .more {
    position: absolute; top: 6px; right: 6px; width: 28px; height: 28px; border-radius: 6px; border: 1px solid var(--line); display: grid; place-items: center;
    background: var(--pane); backdrop-filter: var(--backdrop); color: var(--muted); opacity: 0; transition: opacity 0.12s, background var(--quick), color var(--quick); cursor: pointer;
  }
  .card:hover .more, .more:focus-visible { opacity: 1; }
  .more:hover { color: var(--text); background: color-mix(in srgb, var(--surface) 88%, var(--text)); }

  /* icon mode */
  .icon-tile { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%; border: 0; background: none; outline: none; }
  .sq { position: relative; width: 64px; height: 64px; border-radius: calc(var(--radius) * 1.4); overflow: hidden; display: grid; place-items: center;
    background: var(--pane); backdrop-filter: var(--backdrop); clip-path: var(--notch);
    border: var(--border); box-shadow: var(--shadow); transition: transform 0.16s var(--ease), box-shadow 0.16s var(--ease), border-color 0.16s var(--ease); }
  .icon-tile:active .sq, .icon-tile:active:hover .sq { transform: scale(0.95); box-shadow: var(--shadow); transition-duration: 0.06s; }
  .icon-tile:hover .sq { transform: translateY(var(--hover-lift)) scale(var(--hover-scale)); box-shadow: var(--hover-shadow); border-color: var(--hover-edge); }
  .icon-tile:hover .lbl { background: var(--hover-title-bg); color: var(--hover-title-text); text-shadow: none; border-radius: var(--radius-sm); }
  .lbl { text-shadow: var(--text-shadow); max-width: 100%; font-size: 13px; text-align: center; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; padding: 0 4px; }
  /* Over a wallpaper the title sits on the tiles' own pane (frosted while Transparency is on), so it reads on any
     picture; hover still lights it up the theme's way. */
  :global(.on-photo) .icon-tile .lbl { padding: 1px 8px; border-radius: max(var(--radius-sm), 6px); background: var(--pane); backdrop-filter: var(--backdrop); box-shadow: var(--shadow); text-shadow: none; }
  :global(.on-photo) .icon-tile:hover .lbl { background: var(--hover-title-bg); color: var(--hover-title-text); }
  .icon-tile.titles-hover .lbl { opacity: 0; transition: opacity 0.12s; }
  .icon-tile.titles-hover:hover .lbl { opacity: 1; }
  .icon-tile .mini { padding: 10px; gap: 4px; }
  .icon-tile .m :global(img) { width: 16px; height: 16px; }

  .mini { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 8px; padding: 10% 18%; width: 100%; height: 100%; box-sizing: border-box; }
  .m { display: grid; place-items: center; border-radius: 8px; background: var(--surface); }
  .thumb .m { background: var(--surface); }
  .icon-tile .m { background: var(--plate); border-radius: 4px; }
  .empty { grid-column: 1 / -1; grid-row: 1 / -1; display: grid; place-items: center; color: var(--muted); font-size: 13px; }
  /* Touch screens have no hover: titles set to "on hover" are shown, and long-press opens the tile menu. */
  @media (hover: none) {
    .titles-hover .cap { position: static; opacity: 1; }
    .icon-tile.titles-hover .lbl { opacity: 1; }
    .card:hover, .icon-tile:hover .sq { transform: none; }
  }
  @media (max-width: 599px) {
    .cap { padding: 7px 10px; font-size: 13px; }
    .lbl { font-size: 12px; }
  }
  .lifted { visibility: hidden; }

  .card.picked, .icon-tile.picked .sq { outline: 2px solid var(--ring); outline-offset: 2px; }
  .tick { position: absolute; top: 6px; left: 6px; z-index: 1; width: 20px; height: 20px; display: grid; place-items: center; box-sizing: border-box; border-radius: 50%;
    border: 2px solid #fff; background: rgb(0 0 0 / 0.28); color: var(--on-ring); box-shadow: 0 1px 3px rgb(0 0 0 / 0.35); }
  .tick.on { border-color: var(--ring); background: var(--ring); }
  .icon-tile .tick { top: 3px; left: 3px; width: 18px; height: 18px; }

  .card.over, .icon-tile.over .sq { outline: 2px solid var(--ring); outline-offset: 3px; }
</style>
