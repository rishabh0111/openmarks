<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Small context menu: keyboard (arrows, Enter, Esc), one level of submenu, stays inside the window. -->
<script lang="ts" module>
  import type { IconName } from './icons';
  export type MenuItem = { label: string; icon?: IconName; run?: () => void; danger?: boolean; disabled?: boolean; sub?: MenuItem[] } | 'sep';
</script>

<script lang="ts">
  import { icons } from './icons';
  let { x, y, items, onclose }: { x: number; y: number; items: MenuItem[]; onclose: () => void } = $props();
  let el = $state<HTMLDivElement>();
  let pos = $state({ left: x, top: y });
  let openSub = $state<number | null>(null);

  $effect(() => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    pos = { left: Math.min(x, innerWidth - r.width - 8), top: Math.min(y, innerHeight - r.height - 8) };
    el.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
  });

  function key(e: KeyboardEvent) {
    const buttons = [...(el?.querySelectorAll<HTMLButtonElement>(':scope > button:not([disabled]), .sub button') ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') onclose();
    else if (e.key === 'ArrowDown') (buttons[(i + 1) % buttons.length] ?? buttons[0])?.focus();
    else if (e.key === 'ArrowUp') (buttons[(i - 1 + buttons.length) % buttons.length] ?? buttons[0])?.focus();
    else return;
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
<div class="menu" role="menu" bind:this={el} style:left="{pos.left}px" style:top="{pos.top}px">
  {#each items as item, i}
    {#if item === 'sep'}
      <hr />
    {:else}
      <button
        role="menuitem"
        class:danger={item.danger}
        disabled={item.disabled}
        aria-haspopup={item.sub ? 'menu' : undefined}
        onclick={() => (item.sub ? (openSub = openSub === i ? null : i) : pick(item))}
        onmouseenter={() => (openSub = item.sub ? i : null)}
      >
        <svg class="ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{#if item.icon}<path d={icons[item.icon]} />{/if}</svg>
        <span class="lbl">{item.label}</span>{#if item.sub}<span class="chev">›</span>{/if}
      </button>
      {#if item.sub && openSub === i}
        <div class="sub" role="menu">
          {#each item.sub as s}
            {#if s !== 'sep'}<button role="menuitem" disabled={s.disabled} onclick={() => pick(s)}>{s.label}</button>{/if}
          {/each}
        </div>
      {/if}
    {/if}
  {/each}
</div>

<style>
  .catch { position: fixed; inset: 0; background: none; border: 0; z-index: 50; cursor: default; }
  .menu {
    position: fixed; z-index: 51; min-width: 200px; max-width: 280px; padding: 4px; border-radius: 8px;
    background: color-mix(in srgb, var(--surface) var(--float-alpha), transparent); backdrop-filter: var(--float-blur); color: var(--text); border: 1px solid var(--line); box-shadow: 0 8px 28px rgb(0 0 0 / 0.22);
    font-size: 13px;
  }
  button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 10px; border: 0; border-radius: 5px; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  button:hover:not([disabled]), button:focus-visible { background: color-mix(in oklab, var(--accent) 14%, transparent); outline: none; }
  button[disabled] { opacity: 0.45; cursor: default; }
  .danger { color: var(--danger, #c62f2f); }
  .chev { color: var(--muted); margin-left: auto; }
  .ic { flex: none; color: var(--muted); }
  .danger .ic { color: inherit; }
  .lbl { flex: 1; }
  hr { border: 0; border-top: 1px solid var(--line); margin: 4px 2px; }
  .sub { margin: 2px 0 4px 26px; padding-left: 6px; border-left: 2px solid var(--line); max-height: 220px; overflow: auto; }
</style>
