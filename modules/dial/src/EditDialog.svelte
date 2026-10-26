<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Add or edit a site, laid out like Settings: a live tile on the left shows exactly what you'll get;
     on the right the address and name, then the picture as five plain choices (Auto · Cover · Logo · Screenshot ·
     Your image) with only the controls that choice needs underneath. Warns about duplicates. -->
<script lang="ts">
  import Modal from './Modal.svelte';
  import CardThumb from './CardThumb.svelte';
  import { bm, sameSite, toUrl } from './bm';
  import { host } from './shared';
  import { previewFor, type Preview } from './preview';
  import { pictures, setPicture, defaultPicture, type Picture } from './pictures.svelte';
  import { peekShot, requestShots, shotsVersion } from './shots.svelte';

  let {
    mode, folderId, id, initialTitle = '', initialUrl = '', existing, dark = false, onclose, ondelete,
  }: {
    mode: 'add' | 'edit'; folderId: string; id?: string; initialTitle?: string; initialUrl?: string; dark?: boolean;
    existing: { id: string; url: string; where: string }[]; onclose: () => void; ondelete?: () => void;
  } = $props();

  let title = $state(initialTitle);
  let url = $state(initialUrl);
  let error = $state('');
  const parsed = $derived(toUrl(url));
  const dupe = $derived(parsed ? existing.find((e) => e.id !== id && sameSite(e.url, parsed)) : undefined);

  // What the site offers, fetched once the address is valid.
  let offer = $state<Preview>({});
  let loading = $state(false);
  let timer: ReturnType<typeof setTimeout>;
  $effect(() => {
    const u = parsed;
    clearTimeout(timer);
    offer = {};
    if (!u) return;
    loading = true;
    timer = setTimeout(() => previewFor(u).then((p) => { if (u === parsed) offer = p; }).finally(() => (loading = false)), 350);
  });

  let pic = $state<Picture>({ ...defaultPicture, ...(id ? pictures[id] ?? {} : {}) });
  type Kind = 'auto' | 'cover' | 'logo' | 'shot' | 'own';
  const kindOf = (s: Picture['source']): Kind => (s === 'image' ? 'cover' : s === 'icon' ? 'logo' : s === 'shot' ? 'shot' : s === 'upload' || s === 'url' ? 'own' : 'auto');
  let kind = $state<Kind>(kindOf(pic.source));
  const set = (p: Partial<Picture>) => (pic = { ...defaultPicture, plate: pic.plate, ...p });
  function pickKind(k: Kind) {
    kind = k;
    if (k === 'auto') set({ source: 'auto' });
    else if (k === 'cover' && offer.images?.[0]) set({ source: 'image', src: pic.source === 'image' ? pic.src : offer.images[0] });
    else if (k === 'logo') set({ source: 'icon', src: pic.source === 'icon' ? pic.src : offer.icons?.[0]?.src });
    else if (k === 'shot') set({ source: 'shot' });
  }

  // Your image: a file (click or drop) or an image address.
  let file = $state<HTMLInputElement>();
  let imageUrl = $state(pic.source === 'url' ? pic.src ?? '' : '');
  let dragging = $state(false);
  function takeFile(f: File | undefined) {
    if (!f) return;
    if (!/^image\//.test(f.type)) return void (error = 'Choose an image file.');
    if (f.size > 3 * 1024 * 1024) return void (error = 'That image is over 3 MB.');
    error = '';
    const r = new FileReader();
    r.onload = () => set({ source: 'upload', src: String(r.result) });
    r.readAsDataURL(f);
  }
  function useUrl() {
    const u = imageUrl.trim();
    if (/^https?:\/\/\S+$/.test(u)) set({ source: 'url', src: u });
  }

  // Screenshot: the one we have, or take one now.
  const shot = $derived(parsed ? (void shotsVersion.n, peekShot(parsed)) : undefined);
  let shooting = $state(false);
  async function shootNow() {
    if (!parsed) return;
    shooting = true;
    await requestShots([parsed]);
    shooting = false;
  }

  const PLATES = ['auto', '#ffffff', '#f2f3f5', '#1f2328', '#0b57d0', '#e8453c', '#0f9d58', '#f5a524'];

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!parsed) return void (error = 'Enter a web address, like example.com');
    const name = title.trim() || offer.title || host(parsed);
    try {
      const target = mode === 'add' ? (await bm.create(folderId, name, parsed)).id : (await bm.update(id!, name, parsed), id!);
      setPicture(target, $state.snapshot(pic));
      onclose();
    } catch {
      error = "Couldn't save change";
    }
  }
</script>

<Modal title={mode === 'add' ? 'Add site' : 'Edit site'} {onclose} width={760}>
  <form class="edit" onsubmit={save}>
    <aside class="preview" aria-label="Preview">
      <div class="tile">
        <span class="thumb">
          {#if parsed}{#key parsed}<CardThumb url={parsed} title={title || offer.title || ''} picture={pic} {dark} />{/key}{/if}
        </span>
        <span class="cap">{title.trim() || offer.title || (parsed ? host(parsed) : 'New site')}</span>
      </div>
      <p class="host">{parsed ? host(parsed) : ' '}{#if loading} · looking…{/if}</p>
    </aside>

    <div class="fields">
      <label>Address<input type="text" bind:value={url} placeholder="example.com" autocomplete="off" /></label>
      <label>Name<input type="text" bind:value={title} placeholder={offer.title ?? (parsed ? host(parsed) : 'Optional')} /></label>

      <div class="seg" role="radiogroup" aria-label="Picture">
        {#each [['auto', 'Auto'], ['cover', 'Cover'], ['logo', 'Logo'], ['shot', 'Screenshot'], ['own', 'Your image']] as [k, label] (k)}
          <button type="button" role="radio" aria-checked={kind === k} class:on={kind === k} onclick={() => pickKind(k as Kind)}>{label}</button>
        {/each}
      </div>

      <div class="choice">
        {#if kind === 'auto'}
          <!-- nothing to choose: the tile follows Settings → Look -->
        {:else if kind === 'cover'}
          {#if offer.images?.length}
            <div class="grid covers">
              {#each offer.images as src (src)}
                <button type="button" class="pick cover" class:on={pic.source === 'image' && pic.src === src} onclick={() => set({ source: 'image', src })} aria-label="Use this cover">
                  <img src={src} alt="" onerror={(e) => ((e.currentTarget as HTMLElement).closest('button')!.hidden = true)} />
                </button>
              {/each}
            </div>
          {:else}
            <p class="say">{loading ? 'Looking for cover images…' : 'This page has no cover image. Try Logo or Screenshot.'}</p>
          {/if}
        {:else if kind === 'logo'}
          <div class="grid logos">
            {#each offer.icons ?? [] as ic (ic.src)}
              <button type="button" class="pick logo" class:on={pic.source === 'icon' && pic.src === ic.src} onclick={() => set({ source: 'icon', src: ic.src })} aria-label="Use this logo ({ic.px} px)">
                <img src={ic.src} alt="" /><small>{ic.px}</small>
              </button>
            {:else}
              <p class="say">{loading ? 'Looking for logos…' : 'No logo found; the tile shows a letter.'}</p>
            {/each}
          </div>
          <div class="plates" role="radiogroup" aria-label="Background">
            <span>Background</span>
            {#each PLATES as c (c)}
              <button type="button" role="radio" aria-checked={pic.plate === c} class="sw" class:on={pic.plate === c} class:auto={c === 'auto'} style:background={c === 'auto' ? undefined : c}
                onclick={() => (pic = { ...pic, plate: c })} aria-label={c === 'auto' ? 'Automatic' : c}>{c === 'auto' ? 'A' : ''}</button>
            {/each}
            <input type="color" aria-label="Any colour" value={pic.plate.startsWith('#') ? pic.plate : '#ffffff'} oninput={(e) => (pic = { ...pic, plate: (e.currentTarget as HTMLInputElement).value })} />
          </div>
        {:else if kind === 'shot'}
          <div class="shotrow">
            {#if shot}<img class="shotimg" src={shot} alt="Current screenshot" />{:else}<span class="shotimg empty">No screenshot yet</span>{/if}
            <div>
              <p class="say">Taken whenever you visit the page, or right now. It opens for a moment in a small window.</p>
              <button type="button" class="btn" disabled={!parsed || shooting} onclick={shootNow}>{shooting ? 'Taking screenshot…' : shot ? 'Retake now' : 'Take screenshot'}</button>
            </div>
          </div>
        {:else}
          <button type="button" class="drop" class:over={dragging} onclick={() => file?.click()}
            ondragover={(e) => { e.preventDefault(); dragging = true; }} ondragleave={() => (dragging = false)}
            ondrop={(e) => { e.preventDefault(); dragging = false; takeFile(e.dataTransfer?.files[0]); }}>
            {#if pic.source === 'upload' && pic.src}<img src={pic.src} alt="" />{/if}
            <span>Drop an image here, or <u>choose a file</u></span>
          </button>
          <input bind:this={file} type="file" accept="image/*" hidden onchange={() => takeFile(file?.files?.[0])} />
          <input class="imgurl" type="url" bind:value={imageUrl} placeholder="…or paste an image address" onchange={useUrl} onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), useUrl())} />
        {/if}
      </div>

      {#if dupe}<p class="warn">Already on your dial in <strong>{dupe.where}</strong>.</p>{/if}
      {#if error}<p class="warn">{error}</p>{/if}
    </div>

    <div class="actions">
      {#if mode === 'edit' && ondelete}<button type="button" class="btn danger" onclick={ondelete}>Delete</button>{/if}
      <span class="grow"></span>
      <button type="button" class="btn" onclick={onclose}>Cancel</button>
      <button class="btn primary" disabled={!parsed}>{mode === 'add' ? (dupe ? 'Add anyway' : 'Add') : 'Save'}</button>
    </div>
  </form>
</Modal>

<style>
  .edit { display: grid; grid-template-columns: 240px 1fr; gap: 8px 24px; }
  .preview { --tile: 240px; }
  .tile { display: flex; flex-direction: column; border-radius: var(--radius); overflow: hidden; border: var(--border); box-shadow: var(--shadow); background: var(--surface); clip-path: var(--notch); }
  .thumb { position: relative; aspect-ratio: 16 / 10; background: var(--plate); }
  .cap { padding: 9px 12px; font-size: 14px; color: var(--text); border-top: 1px solid var(--line); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .host { margin: 8px 2px 0; font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fields { min-width: 0; }
  .seg { display: flex; padding: 3px; gap: 2px; border-radius: 10px; background: var(--surface-2); margin: 4px 0 12px; }
  .seg button { flex: 1; padding: 7px 4px; border: 0; border-radius: 8px; background: none; color: var(--muted); font: inherit; font-size: 13px; cursor: pointer; white-space: nowrap; }
  .seg button.on { background: var(--surface); color: var(--text); font-weight: 600; box-shadow: 0 1px 3px rgb(0 0 0 / 0.15); }
  .seg button { transition: background var(--quick) var(--ease), color var(--quick) var(--ease); }
  .seg button:hover:not(.on) { color: var(--text); background: var(--tint); }
  .choice:empty { display: none; }
  .say { margin: 4px 0; font-size: 13px; color: var(--muted); line-height: 1.45; }
  .grid { display: grid; gap: 8px; }
  .covers { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
  .logos { grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); }
  .pick { position: relative; padding: 0; border: 2px solid transparent; border-radius: 8px; background: var(--surface-2); cursor: pointer; overflow: hidden; }
  .pick.on { border-color: var(--ring); }
  .cover { aspect-ratio: 16 / 10; }
  .cover img { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; }
  .logo { aspect-ratio: 1; display: grid; place-items: center; }
  .logo img { width: 56%; height: 56%; object-fit: contain; }
  .logo small { position: absolute; right: 4px; bottom: 2px; font-size: 10px; color: var(--muted); }
  .plates { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 12px; font-size: 13px; color: var(--muted); }
  .plates span { margin-right: 4px; }
  .sw { width: 24px; height: 24px; padding: 0; border-radius: 50%; border: 1px solid var(--line); cursor: pointer; font: 600 10px/1 system-ui; color: var(--muted); }
  .sw.auto { background: var(--surface-2); }
  .sw.on { outline: 2px solid var(--ring); outline-offset: 2px; }
  .plates input[type='color'] { width: 28px; height: 26px; padding: 0; border: 1px solid var(--line); border-radius: 6px; background: none; cursor: pointer; }
  .shotrow { display: grid; grid-template-columns: 180px 1fr; gap: 14px; align-items: start; }
  .shotimg { width: 180px; aspect-ratio: 16 / 10; object-fit: cover; border-radius: 8px; border: 1px solid var(--line); display: grid; place-items: center; font-size: 12px; color: var(--muted); background: var(--surface-2); }
  .shotrow .btn { margin-top: 8px; }
  .drop { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 96px; padding: 12px; border: 1.5px dashed var(--line); border-radius: 10px;
    background: none; color: var(--muted); font: inherit; font-size: 13px; cursor: pointer; }
  .drop.over, .drop:hover { border-color: var(--ring); color: var(--text); }
  .drop img { max-height: 64px; border-radius: 6px; }
  .imgurl { width: 100%; box-sizing: border-box; margin-top: 8px; }
  .actions { grid-column: 1 / -1; display: flex; gap: 8px; align-items: center; margin-top: 8px; }
  .grow { flex: 1; }
  .btn.danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 40%, transparent); }
  .btn.danger:hover { background: color-mix(in srgb, var(--danger) 12%, transparent); border-color: var(--danger); }
  .warn { margin: 10px 0 0; }
  @media (max-width: 640px) {
    .edit { grid-template-columns: 1fr; }
    .preview { --tile: 200px; max-width: 220px; margin: 0 auto; }
    .seg { overflow-x: auto; }
    .shotrow { grid-template-columns: 1fr; }
  }
</style>
