<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Choose the search engine (Settings › Page › Search engine): a built-in one (Google by default) or your own, with
     a search address and, optionally, a suggestions address. Every engine can be edited (a built-in one you edit keeps
     a Reset back to the original); engines you added can be removed. -->
<script lang="ts">
  import Modal from './Modal.svelte';
  import { prefs, savePrefs } from './prefs.svelte';
  import { allEngines, builtInEngines, checkEngine, type Engine } from './search';
  import { host } from './shared';
  import EngineIcon from './EngineIcon.svelte';
  let { onclose }: { onclose: () => void } = $props();

  const engines = $derived(allEngines(prefs.engines));
  function choose(id: string) {
    prefs.engine = id;
    savePrefs();
  }
  /** Removes one you added, or your version of a built-in one (which brings the original back). */
  function remove(id: string) {
    prefs.engines = prefs.engines.filter((e) => e.id !== id);
    if (prefs.engine === id && !builtInEngines.some((b) => b.id === id)) prefs.engine = 'google';
    savePrefs();
  }

  // The form: adding a new engine (editing = 'new') or editing one (its id).
  let editing = $state<string | null>(null);
  let addBtn = $state<HTMLButtonElement>();
  /** Closes the form; focus goes to "Add a search engine" so it stays in the dialog (Esc, Tab keep working). */
  function done() {
    editing = null;
    queueMicrotask(() => addBtn?.focus());
  }
  let name = $state(''), url = $state(''), suggest = $state(''), error = $state('');
  function open(e?: Engine) {
    editing = e?.id ?? 'new';
    name = e?.name ?? '';
    url = e?.url ?? '';
    suggest = e?.suggest ?? '';
    error = '';
  }
  function save(ev: SubmitEvent) {
    ev.preventDefault();
    error = checkEngine(name, url, suggest);
    if (error) return;
    const id = editing === 'new' || !editing ? `own-${Date.now().toString(36)}` : editing;
    const engine = { id, name: name.trim(), url: url.trim(), ...(suggest.trim() ? { suggest: suggest.trim() } : {}) };
    prefs.engines = prefs.engines.some((e) => e.id === id) ? prefs.engines.map((e) => (e.id === id ? engine : e)) : [...prefs.engines, engine];
    if (editing === 'new') choose(id);
    else savePrefs();
    done();
  }
  const editingName = $derived(editing && editing !== 'new' ? engines.find((e) => e.id === editing)?.name : '');
</script>

<Modal title="Search engine" {onclose} width={520}>
  <p class="lead">Search uses this engine for the web, and for suggestions as you type when Suggestions is on.</p>
  <div class="list" role="radiogroup" aria-label="Search engines">
    {#each engines as e (e.id)}
      <div class="row" class:on={prefs.engine === e.id} class:being={editing === e.id}>
        <button class="pick" role="radio" aria-checked={prefs.engine === e.id} onclick={() => choose(e.id)}>
          <span class="dot" aria-hidden="true"></span>
          <EngineIcon engine={e} size={18} />
          <span class="name">{e.name}</span>
          {#if e.edited}<span class="tag">edited</span>{/if}
          <small>{host(e.url)}{#if !e.suggest}{' · no suggestions'}{/if}</small>
        </button>
        <span class="acts">
          <button class="act" aria-label="Edit {e.name}" title="Edit" onclick={() => open(e)}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
          </button>
          {#if e.edited}
            <button class="act" aria-label="Reset {e.name} to the original" title="Reset to the original" onclick={() => remove(e.id)}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/></svg>
            </button>
          {:else if e.custom}
            <button class="act rm" aria-label="Remove {e.name}" title="Remove" onclick={() => remove(e.id)}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
            </button>
          {/if}
        </span>
      </div>
    {/each}
  </div>

  {#if editing}
    <form class="add" onsubmit={save}>
      <h3>{editing === 'new' ? 'Add a search engine' : `Edit ${editingName}`}</h3>
      <label>Name<input type="text" bind:value={name} placeholder="Example Search" /></label>
      <label>Search address<input type="text" bind:value={url} placeholder="https://example.com/search?q=%s" /></label>
      <label>Suggestions address <span class="opt">(optional)</span><input type="text" bind:value={suggest} placeholder="https://example.com/suggest?q=%s" /></label>
      <p class="note">Put <code>%s</code> where the search text goes. Suggestions must answer in the OpenSearch form most engines use; leave it empty for none.</p>
      {#if error}<p class="warn" role="alert">{error}</p>{/if}
      <div class="actions">
        <button type="button" class="btn" onclick={done}>Cancel</button>
        <button type="submit" class="btn primary">{editing === 'new' ? 'Add engine' : 'Save'}</button>
      </div>
    </form>
  {:else}
    <div class="actions"><button class="btn" bind:this={addBtn} onclick={() => open()}>+ Add a search engine</button></div>
  {/if}
</Modal>

<style>
  .lead { margin: 0 0 12px; font-size: 13px; color: var(--muted); line-height: 1.5; }
  .list { border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
  .row { display: flex; align-items: center; border-bottom: 1px solid var(--line); transition: background var(--quick, 0.14s) var(--ease, ease); }
  .row:last-child { border-bottom: 0; }
  .row:hover { background: var(--tint); }
  .row.being { background: var(--tint-press); }
  .pick { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 10px 6px 10px 12px; border: 0; background: none; color: var(--text); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
  .name { font-weight: 500; white-space: nowrap; }
  .tag { padding: 1px 6px; border-radius: 999px; background: var(--tint); color: var(--muted); font-size: 11px; }
  small { margin-left: auto; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dot { flex: none; width: 14px; height: 14px; box-sizing: border-box; border-radius: 50%; border: 2px solid color-mix(in srgb, var(--muted) 55%, transparent); }
  .on .dot { border: 4px solid var(--ring); }
  .on .name { font-weight: 600; }
  /* Edit (and Reset or Remove) for each engine: quiet until the row is pointed at, like a tile's ⋯. */
  .acts { flex: none; display: flex; gap: 2px; padding-right: 6px; opacity: 0.35; transition: opacity var(--quick, 0.14s); }
  .row:hover .acts, .row.being .acts, .acts:focus-within { opacity: 1; }
  .act { width: 28px; height: 28px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 6px; background: none; color: var(--muted); cursor: pointer;
    transition: background var(--quick, 0.14s), color var(--quick, 0.14s); }
  .act:hover { color: var(--text); background: var(--tint-press); }
  .act.rm:hover { color: var(--danger, #c62f2f); background: color-mix(in srgb, var(--danger, #c62f2f) 12%, transparent); }
  .add { margin-top: 14px; }
  .add h3 { margin: 0 0 10px; font-size: 13px; font-weight: 600; }
  .opt { color: var(--muted); font-weight: 400; }
  .note { margin: 0 0 8px; font-size: 12px; color: var(--muted); line-height: 1.5; }
  code { font: 12px ui-monospace, monospace; color: var(--text); }
  @media (hover: none) { .acts { opacity: 1; } }
</style>
