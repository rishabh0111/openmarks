<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Small context menu: keyboard (arrows, Enter, Esc), one level of submenu, stays inside the window.
     A submenu flies out to the side (to the left when there's no room on the right) and opens only when the pointer
     rests on its item, so moving down past "Move to" doesn't open it or shift the items below. -->
<script lang="ts" module>
  import type { IconName } from './icons';
  export type MenuItem = { label: string; icon?: IconName; run?: () => void; danger?: boolean; disabled?: boolean; sub?: MenuItem[] } | 'sep';
</script>

<script lang="ts">
  import { icons } from './icons';
  let { x, y, items, above = false, onclose }: {
    x: number; y: number; items: MenuItem[];
    above?: boolean; // open upward from y (for a menu from a button at the bottom of the window)
    onclose: () => void;
  } = $props();
  let el = $state<HTMLDivElement>();
  let pos = $state({ left: x, top: y });
  let openSub = $state<number | null>(null);
  let flip = $state(false); // submenu on the left
  let subEl = $state<HTMLDivElement>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    pos = { left: Math.min(x, innerWidth - r.width - 8), top: above ? Math.max(8, y - r.height) : Math.min(y, innerHeight - r.height - 8) };
    el.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
  });
  // Keep an open submenu inside the window: flip to the left, or move up.
  $effect(() => {
    if (!subEl || !el) return;
    const m = el.getBoundingClientRect(), s = subEl.getBoundingClientRect();
    flip = m.right + s.width + 4 > innerWidth - 8;
    const over = s.bottom - (innerHeight - 8);
    if (over > 0) subEl.style.top = `${-4 - over}px`;
  });

  /** Opens (or closes) submenus after the pointer rests a moment: passing over an item does nothing. */
  function hover(i: number, item: Exclude<MenuItem, 'sep'>) {
    clearTimeout(timer);
    if (openSub === i) return;
    timer = setTimeout(() => (openSub = item.sub && !item.disabled ? i : null), item.sub ? 350 : 300);
  }
  function openNow(i: number, focus = false) {
    clearTimeout(timer);
    openSub = i;
    if (focus) queueMicrotask(() => subEl?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus());
  }
  function key(e: KeyboardEvent) {
    const buttons = [...(el?.querySelectorAll<HTMLButtonElement>(':scope > .item > button:not([disabled]), .sub button:not([disabled])') ?? [])];
    const a = document.activeElement as HTMLButtonElement;
    const i = buttons.indexOf(a);
    const inSub = !!a?.closest('.sub');
    if (e.key === 'Escape') onclose();
    else if (e.key === 'ArrowDown') (buttons[(i + 1) % buttons.length] ?? buttons[0])?.focus();
    else if (e.key === 'ArrowUp') (buttons[(i - 1 + buttons.length) % buttons.length] ?? buttons[0])?.focus();
    else if (e.key === (flip ? 'ArrowLeft' : 'ArrowRight') && !inSub && a?.dataset.sub) openNow(Number(a.dataset.sub), true);
    else if (e.key === (flip ? 'ArrowRight' : 'ArrowLeft') && inSub) {
      const parent = el?.querySelector<HTMLButtonElement>(`[data-sub="${openSub}"]`);
      openSub = null;
      parent?.focus();
    } else return;
    e.preventDefault();
  }
  function pick(item: Exclude<MenuItem, 'sep'>) {
    if (item.disabled || item.sub) return;
    onclose();
    item.run?.();
  }
</script>

<svelte:window onkeydown={key} onblur={onclose} />
<button class="catch" aria-label="Close menu" onclick={onclose} oncontextmenu={(e) => { e.preventDefault(); onclose(); }}></button>
<div class="menu" role="menu" tabindex="-1" bind:this={el} style:left="{pos.left}px" style:top="{pos.top}px" onmouseleave={() => clearTimeout(timer)}>
  {#each items as item, i}
    {#if item === 'sep'}
      <hr />
    {:else}
      <div class="item" role="none">
        <button
          role="menuitem"
          class:danger={item.danger}
          class:open={openSub === i}
          disabled={item.disabled}
          aria-haspopup={item.sub ? 'menu' : undefined}
          aria-expanded={item.sub ? openSub === i : undefined}
          data-sub={item.sub ? i : undefined}
          onclick={() => (item.sub ? (openSub === i ? (openSub = null) : openNow(i)) : pick(item))}
          onmouseenter={() => hover(i, item)}
        >
          <svg class="ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{#if item.icon}<path d={icons[item.icon]} />{/if}</svg>
          <span class="lbl">{item.label}</span>{#if item.sub}<span class="chev" aria-hidden="true">{flip ? '‹' : '›'}</span>{/if}
        </button>
        {#if item.sub && openSub === i}
          <div class="sub" class:flip role="menu" tabindex="-1" bind:this={subEl} onmouseenter={() => clearTimeout(timer)}>
            <div class="scroll">
              {#each item.sub as s}
                {#if s !== 'sep'}<button role="menuitem" disabled={s.disabled} onclick={() => pick(s)}>{s.label}</button>{/if}
              {/each}
              {#if !item.sub.length}<span class="empty">No other folders</span>{/if}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  {/each}
</div>

<style>
  /* The click-away layer under the menu: invisible, always (it takes no menu-button styles, or hovering anywhere off
     the menu would tint the whole page). */
  .catch { position: fixed; inset: 0; padding: 0; background: none; border: 0; z-index: 50; cursor: default; }
  /* Every menu, and the "Move to" list, is the floating surface: frosted with Transparency on, solid with it off. */
  .menu, .sub {
    padding: 4px; border-radius: 8px; color: var(--text); border: 1px solid var(--line); box-shadow: 0 8px 28px rgb(0 0 0 / 0.22);
    font-size: 13px;
  }
  .menu::before, .sub::before { content: ''; position: absolute; inset: 0; z-index: -1; border-radius: inherit; background: var(--float); backdrop-filter: var(--float-blur); }
  .menu { position: fixed; z-index: 51; min-width: 200px; max-width: 280px; outline: none; }
  .item { position: relative; }
  .menu button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 10px; border: 0; border-radius: 5px; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  .menu button { transition: background 0.1s var(--ease); }
  .menu button:hover:not([disabled]), .menu button:focus-visible, .menu button.open { background: var(--tint-press, color-mix(in srgb, var(--text) 13%, transparent)); outline: none; }
  .menu button:active:not([disabled]) { background: color-mix(in srgb, var(--text) 18%, transparent); }
  .menu button.danger:hover:not([disabled]), .menu button.danger:focus-visible { background: color-mix(in srgb, var(--danger, #c62f2f) 14%, transparent); }
  .menu button[disabled] { opacity: 0.45; cursor: default; }
  .danger { color: var(--danger, #c62f2f); }
  .chev { color: var(--muted); margin-left: auto; }
  .ic { flex: none; color: var(--muted); }
  .danger .ic { color: inherit; }
  .lbl { flex: 1; }
  hr { border: 0; border-top: 1px solid var(--line); margin: 4px 2px; }
  /* The submenu sits beside its item, outside the menu, so nothing in the menu moves when it opens. */
  .sub { position: absolute; top: -5px; left: calc(100% + 6px); z-index: 52; min-width: 160px; max-width: 240px; outline: none; }
  .scroll { max-height: 252px; overflow: auto; }
  .sub.flip { left: auto; right: calc(100% + 6px); }
  .sub button { padding: 7px 12px; }
  .empty { display: block; padding: 7px 12px; color: var(--muted); }
</style>
