<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Name a folder (replaces window.prompt). -->
<script lang="ts">
  import Modal from './Modal.svelte';
  let { title, initial = '', action, onsave, onclose }: { title: string; initial?: string; action: string; onsave: (name: string) => void; onclose: () => void } = $props();
  let name = $state(initial);
</script>

<Modal {title} {onclose} width={380}>
  <form onsubmit={(e) => { e.preventDefault(); if (name.trim()) { onsave(name.trim()); onclose(); } }}>
    <label>Name<input type="text" bind:value={name} /></label>
    <div class="actions">
      <button type="button" class="btn" onclick={onclose}>Cancel</button>
      <button class="btn primary" disabled={!name.trim()}>{action}</button>
    </div>
  </form>
</Modal>
