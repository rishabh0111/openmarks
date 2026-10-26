<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Plain modal dialog (native <dialog>: focus trap, Esc to close; Esc also closes it when focus has ended up outside,
     say after the button you pressed went away). -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  let { title, onclose, children, width = 420 }: { title: string; onclose: () => void; children: Snippet; width?: number } = $props();
  let d = $state<HTMLDialogElement>();
  $effect(() => d?.showModal());
  function esc(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !d?.open || d.contains(document.activeElement)) return;
    if ([...document.querySelectorAll('dialog[open]')].at(-1) !== d) return; // only the top one
    e.preventDefault();
    d.close();
  }
</script>

<svelte:window onkeydown={esc} />
<dialog bind:this={d} onclose={onclose} style:width="min({width}px, calc(100vw - 24px))" aria-label={title}>
  <header><h2>{title}</h2><button type="button" class="x" aria-label="Close" onclick={() => d?.close()}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header>
  {@render children()}
</dialog>

<style>
  dialog { box-sizing: border-box; max-height: calc(100vh - 24px); overflow: auto; border: 1px solid var(--line); border-radius: 12px; padding: 18px 20px; background: color-mix(in srgb, var(--surface) var(--float-alpha, 100%), transparent); backdrop-filter: var(--float-blur, none); color: var(--text); box-shadow: 0 20px 60px rgb(0 0 0 / 0.3); font: inherit; }
  dialog::backdrop { background: rgb(0 0 0 / 0.28); backdrop-filter: var(--scrim-blur, none); }
  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  h2 { margin: 0; font-size: 15px; }
  .x { width: 32px; height: 32px; display: grid; place-items: center; border: 0; border-radius: 6px; background: none; color: var(--muted); cursor: pointer; margin: -6px -8px 0 0; }
  .x { transition: background var(--quick, 0.14s), color var(--quick, 0.14s); }
  .x:hover { background: var(--tint); color: var(--text); }
  .x:active { background: var(--tint-press); }
  :global(dialog label) { display: grid; gap: 4px; margin-bottom: 10px; font-size: 13px; color: var(--muted); }
  :global(dialog input[type='text']), :global(dialog input[type='url']) {
    height: 34px; padding: 0 10px; border-radius: 6px; border: 1px solid var(--line); background: var(--surface-2); color: var(--text); font: inherit;
  }
  :global(dialog .actions) { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
  :global(dialog .btn) { padding: 7px 14px; border-radius: 6px; border: 1px solid var(--line); background: none; color: var(--text); font: inherit; cursor: pointer; }
  :global(dialog .btn.primary) { background: var(--ring); border-color: var(--ring); color: var(--on-ring); }
  :global(dialog .btn[disabled]) { opacity: 0.5; cursor: default; }
  :global(dialog .btn) { transition: background var(--quick, 0.14s) var(--ease, ease), filter var(--quick, 0.14s), transform 0.08s; }
  :global(dialog .btn:hover:not([disabled])) { background: var(--tint); }
  :global(dialog .btn.primary:hover:not([disabled])) { background: var(--ring); filter: brightness(1.08); }
  :global(dialog .btn:active:not([disabled])) { transform: scale(0.97); }
  :global(dialog :focus-visible) { outline: 2px solid var(--ring); outline-offset: 2px; }
  :global(dialog .warn) { padding: 8px 10px; border-radius: 6px; background: color-mix(in oklab, #f5a524 18%, transparent); font-size: 13px; color: var(--text); }
</style>
