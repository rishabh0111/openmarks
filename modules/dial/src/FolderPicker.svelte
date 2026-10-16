<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Choose the Dial folder (first run and Settings). Suggests folders that look like an
     existing speed dial (a "Speed Dial" folder, Vivaldi/Opera speed dials) and the bookmarks bar. -->
<script lang="ts">
  import { folderName } from './shared';
  import Modal from './Modal.svelte';
  import { bm, type Node } from './bm';
  let { current, onpick, onclose }: { current: string | null; onpick: (id: string | null) => void; onclose: () => void } = $props();

  type Row = { id: string; path: string; count: number; suggested: boolean };
  let rows = $state<Row[]>([]);
  bm.tree().then((t) => {
    const out: Row[] = [];
    const walk = (n: Node, path: string, depth: number) => {
      for (const c of n.children ?? []) {
        if (c.url !== undefined || c.type === 'separator') continue;
        const p = path ? `${path} › ${folderName(c.title)}` : folderName(c.title);
        const count = (c.children ?? []).filter((x) => x.url !== undefined).length;
        out.push({ id: c.id, path: p, count, suggested: depth > 0 && /speed ?dial|openmarks/i.test(c.title) || /^(bookmarks bar|bookmarks toolbar)$/i.test(c.title) });
        walk(c, p, depth + 1);
      }
    };
    for (const r of t) walk(r, '', 0);
    rows = out.sort((a, b) => Number(b.suggested) - Number(a.suggested));
  });
</script>

<Modal title="Choose your Dial folder" {onclose} width={480}>
  <p class="lead">Your dial shows one bookmarks folder. Pick an existing one (your old speed dial or the bookmarks bar), or keep Openmarks' own folder.</p>
  <div class="list" role="listbox" aria-label="Folders">
    <button role="option" aria-selected={current === null} class:on={current === null} onclick={() => { onpick(null); onclose(); }}>
      <span>Openmarks <em>default</em></span>
    </button>
    {#each rows as r (r.id)}
      <button role="option" aria-selected={current === r.id} class:on={current === r.id} onclick={() => { onpick(r.id); onclose(); }}>
        <span>{r.path}{#if r.suggested} <em>suggested</em>{/if}</span><small>{r.count}</small>
      </button>
    {/each}
  </div>
</Modal>

<style>
  .lead { margin: 0 0 12px; font-size: 13px; color: var(--muted); line-height: 1.5; }
  .list { max-height: 340px; overflow: auto; border: 1px solid var(--line); border-radius: 8px; }
  .list button { display: flex; justify-content: space-between; width: 100%; padding: 9px 12px; border: 0; border-bottom: 1px solid var(--line); background: none; color: var(--text); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
  .list button:last-child { border-bottom: 0; }
  .list button:hover { background: var(--surface-2); }
  .list button.on { background: color-mix(in oklab, var(--accent) 14%, transparent); }
  em { font-style: normal; font-size: 11px; color: var(--accent); margin-left: 6px; }
  small { color: var(--muted); }
</style>
