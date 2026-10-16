<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script lang="ts">
  import type { DialFolder, ModuleApi } from '@openmarks/module-sdk';
  import Shell from './Shell.svelte';
  import { prefs } from './prefs.svelte';
  import { bm } from './bm';
  import { cacheReady } from './preview';
  import { shotsReady } from './shots.svelte';
  import { withFolderNames } from './shared';

  let { api }: { api: ModuleApi } = $props();

  let dial = $state<DialFolder | null>(null);
  let failed = $state(false);
  let slow = $state(false);
  let retry = $state<HTMLButtonElement>();

  // Pictures come from the cache in the same frame as the bookmarks (both load in parallel).
  async function loadDial() {
    const [d] = await Promise.all([readDial(), cacheReady, shotsReady]);
    return withFolderNames(d);
  }
  // The folder the user picked, falling back to the default Openmarks folder.
  async function readDial() {
    if (prefs.dialFolder) {
      try {
        return await bm.dialFrom(prefs.dialFolder);
      } catch {
        prefs.dialFolder = null;
      }
    }
    return api.bookmarks.dial();
  }

  async function load() {
    failed = false;
    slow = false;
    const timer = setTimeout(() => (slow = true), 200);
    try {
      dial = await loadDial();
    } catch (error) {
      console.error("Openmarks couldn't load your bookmarks.", error instanceof Error && error.cause !== undefined ? error.cause : error);
      failed = true;
    } finally {
      clearTimeout(timer);
    }
  }

  load();
  // Re-read bookmarks after a change without showing the loading state.
  async function refresh() {
    try {
      dial = await loadDial();
    } catch {
      /* keep the last view */
    }
  }

  $effect(() => retry?.focus());
</script>

{#if failed}
  <p>Openmarks couldn't load your bookmarks.</p>
  <button type="button" bind:this={retry} onclick={load}>Try again</button>
{:else if dial}
  <Shell {dial} reload={refresh} />
{:else if slow}
  <p>Loading your dial…</p>
{/if}
