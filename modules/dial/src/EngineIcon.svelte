<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- A search engine's own icon, read from its site through the same cache as tile icons (preview.ts): fetched once,
     kept, shown at once after that. The engine's first letter until then, or when its site has none. -->
<script lang="ts">
  import { previewFor, peekPreview } from './preview';
  import type { Engine } from './search';
  let { engine, size = 16 }: { engine: Engine; size?: number } = $props();

  const home = $derived.by(() => {
    try {
      return new URL(engine.url).origin + '/';
    } catch {
      return '';
    }
  });
  let src = $state<string | undefined>();
  $effect(() => {
    const h = home;
    src = h ? peekPreview(h)?.icon : undefined;
    if (h && !src) previewFor(h).then((p) => { if (h === home) src = p.icon; });
  });
</script>

<span class="ei" style:width="{size}px" style:height="{size}px" aria-hidden="true">
  {#if src}<img {src} alt="" />{:else}<span class="l" style:font-size="{Math.round(size * 0.62)}px">{engine.name.charAt(0)}</span>{/if}
</span>

<style>
  .ei { flex: none; display: inline-grid; place-items: center; border-radius: 4px; overflow: hidden; vertical-align: middle; }
  img { width: 100%; height: 100%; object-fit: contain; }
  .l { width: 100%; height: 100%; display: grid; place-items: center; border-radius: inherit; background: var(--surface-2); color: var(--text); font-weight: 700; line-height: 1; }
</style>
