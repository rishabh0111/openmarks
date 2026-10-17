<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- A site's icon inside a folder tile: the fetched icon, else a letter (never the browser's generic globe). -->
<script lang="ts">
  import { previewFor, peekPreview } from './preview';
  import { epoch } from './prefs.svelte';
  import { host } from './shared';
  let { url, title }: { url: string; title: string } = $props();
  let src = $state<string | undefined>(peekPreview(url)?.icon);
  $effect(() => {
    void epoch.n;
    previewFor(url).then((p) => (src = p.icon));
  });
</script>

{#if src}<img {src} alt="" />{:else}<b>{(title || host(url)).charAt(0).toUpperCase()}</b>{/if}

<style>
  img { width: 22px; height: 22px; object-fit: contain; border-radius: 5px; }
  b { font-weight: 600; font-size: 14px; color: var(--muted); }
</style>
