<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Every shortcut on one sheet ("?" or right-click → Keyboard shortcuts). -->
<script lang="ts">
  import Modal from './Modal.svelte';
  let { vim, onclose }: { vim: boolean; onclose: () => void } = $props();
  const groups = $derived([
    ['Keyboard', [
      [['/'], 'Search (or just start typing)'], [['←', '↑', '→', '↓'], 'Move between tiles'], [['Enter'], 'Open'],
      [['[', ']'], 'Previous / next folder'],
      [['Esc'], 'Back out of a folder'], [['Alt', '←', '→'], 'Move the tile'], [['Shift', 'click'], 'Select tiles (again for a range)'], [['Ctrl', 'V'], 'Paste a link to add it'], [['?'], 'This sheet'],
    ]],
    ...(vim ? [['Vim keys', [
      [['h', 'j', 'k', 'l'], 'Move between tiles'], [['g g'], 'First tile'], [['G'], 'Last tile'],
      [['o'], 'Open'], [['O'], 'Open in a new tab'], [['H', 'L'], 'Previous / next folder'],
    ]]] : []),
    ['Controller', [
      [['D-pad'], 'Move'], [['A'], 'Open'], [['B'], 'Back'], [['X'], 'Tile menu'], [['Y'], 'Search'], [['LB', 'RB'], 'Previous / next folder'], [['Start'], 'Settings'],
    ]],
  ] as [string, [string[], string][]][]);
</script>

<Modal title="Keyboard shortcuts" {onclose} width={460}>
  {#each groups as [name, rows] (name)}
    <h3>{name}</h3>
    <dl>
      {#each rows as [keys, what] (what)}
        <dt>{#each keys as k (k)}<kbd>{k}</kbd>{/each}</dt><dd>{what}</dd>
      {/each}
    </dl>
  {/each}
</Modal>

<style>
  h3 { margin: 12px 0 6px; font-size: 12px; font-weight: 600; color: var(--muted); }
  h3:first-of-type { margin-top: 0; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; margin: 0; align-items: center; font-size: 13px; }
  dt { display: flex; gap: 4px; }
  dd { margin: 0; color: var(--text); }
  kbd { min-width: 22px; padding: 2px 6px; box-sizing: border-box; text-align: center; border-radius: 5px; border: 1px solid var(--line); border-bottom-width: 2px;
    background: var(--surface-2); color: var(--text); font: 600 11px/1.4 ui-monospace, monospace; }
</style>
