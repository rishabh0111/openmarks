<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- A dial tile. Card sizes (S–XL): Vivaldi-style card, picture on top, caption inside the card.
     Icon size: Vivaldi's icon mode, a rounded square with the site's icon and the title below.
     Titles: show / on hover / hide. Right-click, ContextMenu, Shift+F10 or ⋯ open the menu; Alt+←/→ moves; drag to reorder. -->
<script lang="ts">
  import type { DialItem } from '@openmarks/module-sdk';
  import CardThumb from './CardThumb.svelte';
  import MiniIcon from './MiniIcon.svelte';
  import { host } from './shared';
  import { pictures } from './pictures.svelte';
  import { prefs } from './prefs.svelte';

  let {
    item, dark, where, active = false, into = false, lifted = false, onopen, onmenu, onmove, ondragstart, ondrop, onhover, ondragend,
  }: {
    item: DialItem; dark: boolean; where?: string; active?: boolean;
    into?: boolean; // a site is about to be dropped into this folder
    lifted?: boolean; // this tile is the one being dragged (shown as a faint placeholder where it will land)
    onhover?: (target: DialItem, zone: 'before' | 'after' | 'into') => void;
    ondragend?: (e: DragEvent) => void;
    onopen: (id: string) => void;
    onmenu: (x: number, y: number, item: DialItem) => void;
    onmove: (item: DialItem, step: -1 | 1) => void;
    ondragstart: (item: DialItem) => void;
    ondrop: (target: DialItem) => void;
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
    draggable: true,
    'data-id': item.id,
    oncontextmenu: (e: MouseEvent) => { e.preventDefault(); onmenu(e.clientX, e.clientY, item); },
    onkeydown: keys,
    ondragstart: (e: DragEvent) => { e.dataTransfer?.setData('text/plain', item.id); ondragstart(item); },
    // Where the pointer is on this tile decides the drop: left/right half = before/after it; the middle of a folder = into it.
    ondragover: (e: DragEvent) => {
      e.preventDefault();
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
      onhover?.(item, item.kind === 'folder' && x > 0.25 && x < 0.75 ? 'into' : x < 0.5 ? 'before' : 'after');
    },
    ondrop: (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); ondrop(item); },
    ondragend: (e: DragEvent) => ondragend?.(e),
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

{#if iconMode}
  <svelte:element this={item.kind === 'link' ? 'a' : 'button'} class="icon-tile titles-{prefs.titles}" class:over={into} class:lifted class:active
    href={item.kind === 'link' ? item.url : undefined} onclick={item.kind === 'folder' ? () => onopen(item.id) : undefined}
    aria-label={label} {...common}>
    <span class="sq">{@render visual()}</span>
    {#if prefs.titles !== 'hide'}<span class="lbl">{label}</span>{/if}
  </svelte:element>
{:else}
  <svelte:element this={item.kind === 'link' ? 'a' : 'button'} class="card titles-{prefs.titles}" class:over={into} class:lifted class:active
    href={item.kind === 'link' ? item.url : undefined} onclick={item.kind === 'folder' ? () => onopen(item.id) : undefined}
    aria-label={label} {...common}>
    <span class="thumb">{@render visual()}</span>
    {#if prefs.titles !== 'hide'}
      <span class="cap"><span class="t">{label}</span>{#if where}<small>{where}</small>{:else if item.kind === 'folder'}<small>{item.items.length}</small>{/if}</span>
    {/if}
    {#if item.kind === 'link'}
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
    border: var(--border); box-shadow: var(--shadow); transition: transform 0.14s, box-shadow 0.14s, border-color 0.14s;
  }
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
    background: var(--surface); color: var(--muted); opacity: 0; transition: opacity 0.12s; cursor: pointer;
  }
  .card:hover .more, .more:focus-visible { opacity: 1; }

  /* icon mode */
  .icon-tile { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%; border: 0; background: none; outline: none; }
  .sq { position: relative; width: 64px; height: 64px; border-radius: calc(var(--radius) * 1.4); overflow: hidden; display: grid; place-items: center;
    background: var(--pane); backdrop-filter: var(--backdrop); clip-path: var(--notch);
    border: var(--border); box-shadow: var(--shadow); transition: transform 0.14s, box-shadow 0.14s, border-color 0.14s; }
  .icon-tile:hover .sq { transform: translateY(var(--hover-lift)) scale(var(--hover-scale)); box-shadow: var(--hover-shadow); border-color: var(--hover-edge); }
  .icon-tile:hover .lbl { background: var(--hover-title-bg); color: var(--hover-title-text); text-shadow: none; border-radius: var(--radius-sm); }
  .lbl { text-shadow: var(--text-shadow); max-width: 100%; font-size: 13px; text-align: center; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; padding: 0 4px; }
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
  .lifted { opacity: 0.35; }
  .card.over, .icon-tile.over .sq { outline: 2px solid var(--ring); outline-offset: 3px; }
</style>
