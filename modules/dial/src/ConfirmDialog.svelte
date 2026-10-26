<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- In-page confirmation for destructive actions (replaces window.confirm). -->
<script lang="ts">
  import Modal from './Modal.svelte';
  let { title, body, action, danger = false, onyes, onclose }: { title: string; body: string; action: string; danger?: boolean; onyes: () => void; onclose: () => void } = $props();
</script>

<Modal {title} {onclose} width={400}>
  <p class="body">{body}</p>
  <div class="actions">
    <button type="button" class="btn" onclick={onclose}>Cancel</button>
    <button type="button" class="btn primary" class:danger onclick={() => { onyes(); onclose(); }}>{action}</button>
  </div>
</Modal>

<style>
  .body { margin: 0; color: var(--text); font-size: 14px; line-height: 1.5; }
  .danger { background: #d93a3a !important; border-color: #d93a3a !important; }
  .danger:hover { filter: brightness(1.08); }
</style>
