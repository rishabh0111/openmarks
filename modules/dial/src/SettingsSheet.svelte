<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Settings sheet from the bottom, shown with pictures. The Vivaldi set: theme, tile size incl.
     icon mode, titles (show / hover / hide), max columns, search, add button, clock, dial folder; wallpaper as colour,
     gradient (2–4 native-picker colours + angle), your picture, or a daily picture (Bing, Wikimedia, Unsplash). -->
<script lang="ts">
  import { prefs, savePrefs, type TileSize, type Provider, type Wallpaper } from './prefs.svelte';
  import { providers, dailyWallpaper, previewOf, type Daily } from './wallpaper';
  import { builtIn, themeVars, isDark } from './themes';
  let { dark, folderLabel, daily, onclose, onpickfolder, onwallpaper, onrefreshdaily, oncaptureall }: {
    dark: boolean; folderLabel: string; daily: Daily | null; oncaptureall: () => Promise<number>;
    onclose: () => void; onpickfolder: () => void; onwallpaper: (f: File) => void; onrefreshdaily: () => void;
  } = $props();
  $effect(() => {
    JSON.stringify(prefs);
    savePrefs();
  });
  let file = $state<HTMLInputElement>();
  let capturing = $state(false);
  let captured = $state<number | null>(null);
  let tab = $state<'theme' | 'look' | 'wallpaper' | 'page'>('theme');
  const modeDark = $derived(prefs.theme === 'auto' ? matchMedia('(prefers-color-scheme: dark)').matches : prefs.theme === 'dark');

  const sizes: { k: TileSize; label: string }[] = [
    { k: 'icon', label: 'Icon' }, { k: 'S', label: 'Small' }, { k: 'M', label: 'Medium' }, { k: 'L', label: 'Large' }, { k: 'XL', label: 'Huge' },
  ];
  const wk = $derived(prefs.wallpaper.kind);
  let lastColor = $state(prefs.wallpaper.kind === 'color' ? prefs.wallpaper.color : '#3b4a6b');
  let lastGradient = $state<{ colors: string[]; angle: number }>(prefs.wallpaper.kind === 'gradient' ? { colors: [...prefs.wallpaper.colors], angle: prefs.wallpaper.angle } : { colors: ['#4e54c8', '#8f94fb'], angle: 135 });
  // Today's picture from every source (each cached for the day), for the preview cards.
  let previews = $state<Partial<Record<Provider, Daily | null>>>({});
  $effect(() => {
    if (tab !== 'wallpaper' || prefs.wallpaper.kind !== 'daily') return;
    for (const p of Object.keys(providers) as Provider[])
      if (previews[p] === undefined) dailyWallpaper(p).then((d) => (previews[p] = d)).catch(() => (previews[p] = null));
  });
  let lastProvider = $state<Provider>(prefs.wallpaper.kind === 'daily' ? prefs.wallpaper.provider : 'bing');
  const set = (w: Wallpaper) => (prefs.wallpaper = w);
  function setColor(c: string) { lastColor = c; set({ kind: 'color', color: c }); }
  function setGradient(colors: string[], angle = lastGradient.angle) { lastGradient = { colors, angle }; set({ kind: 'gradient', colors, angle }); }
  const grad = (g: { colors: string[]; angle: number }) => `linear-gradient(${g.angle}deg, ${g.colors.join(', ')})`;
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />
<button class="scrim" aria-label="Close settings" onclick={onclose}></button>
<div class="sheet" class:dark role="dialog" aria-label="Settings">
  <div class="grab" aria-hidden="true"></div>
  <div class="tabs" role="tablist">
    {#each [['theme', 'Theme', 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z'], ['look', 'Look', 'M12 3a9 9 0 1 0 0 18 3 3 0 0 0 0-6h-1a2 2 0 0 1 0-4h4a5 5 0 0 0 5-5c0-1.7-3.6-3-8-3zM7.5 10.5h.01M9.5 6.5h.01M14.5 6.5h.01'], ['wallpaper', 'Wallpaper', 'M3 5h18v14H3zM8.5 10a1.5 1.5 0 1 0 0-.01M21 15l-5-5-11 9'], ['page', 'Page', 'M4 6h16M4 12h16M4 18h10']] as [k, label, d]}
      <button role="tab" aria-selected={tab === k} class:on={tab === k} onclick={() => (tab = k as typeof tab)}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path {d} /></svg>{label}
      </button>
    {/each}
  </div>
  <div class="panel">
  {#if tab === 'theme'}
    <section>
      <h3>Theme</h3>
      <div class="opts themes">
        {#each builtIn as t (t.id)}
          {@const v = themeVars(t, isDark(t, modeDark), prefs.glass)}
          <button class="opt" class:on={prefs.themeId === t.id} aria-pressed={prefs.themeId === t.id} onclick={() => (prefs.themeId = t.id)}>
            <span class="tp" style:background={v['--bg']} style:font-family={v['--font-family']}>
              <span class="tpbar" style:text-transform="uppercase"><b style:color={v['--text']}>Home</b><i style:color={v['--muted']}>Work</i></span>
              <span class="tpgrid">
                {#each [0, 1, 2, 3, 4, 5] as i (i)}
                  <span style:background={v['--pane']} style:backdrop-filter={v['--backdrop']} style:border-radius="calc({v['--radius']} / 2.5)" style:clip-path={(v['--notch'] ?? 'none').replace(/\d+px/g, '4px')} style:box-shadow={v['--shadow']} style:border="1px solid {v['--line']}"></span>
                {/each}
              </span>
            </span>
            <span>{t.name}</span>
          </button>
        {/each}
      </div>
    </section>
    <!-- One quiet row under the gallery: light/dark (only when the theme has both) and the Glass switch. -->
    {@const cur = builtIn.find((t) => t.id === prefs.themeId) ?? builtIn[0]!}
    <div class="themerow">
      {#if cur.light && cur.dark}
        <div class="seg" role="radiogroup" aria-label="Light or dark">
          {#each [['auto', 'Auto', 'M12 3a9 9 0 1 0 0 18zM12 3a9 9 0 0 1 0 18'], ['light', 'Light', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'], ['dark', 'Dark', 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z']] as [k, label, d] (k)}
            <button role="radio" aria-checked={prefs.theme === k} class:on={prefs.theme === k} onclick={() => (prefs.theme = k as typeof prefs.theme)}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill={k === 'auto' ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path {d} /></svg>{label}
            </button>
          {/each}
        </div>
      {:else}
        <span class="note">{cur.name} is always {cur.dark ? 'dark' : 'light'}</span>
      {/if}
      <label class="glass">
        <span>Transparency</span>
        <input type="checkbox" role="switch" bind:checked={prefs.glass} />
      </label>
    </div>

  {:else if tab === 'look'}
    <section>
      <h3>Tiles</h3>
      <div class="opts five">
        {#each sizes as s, si}
          <button class="opt" class:on={prefs.tileSize === s.k} aria-pressed={prefs.tileSize === s.k} onclick={() => (prefs.tileSize = s.k)}>
            <svg viewBox="0 0 96 56" aria-hidden="true">
              <rect width="96" height="56" rx="6" class="bg" />
              {#if s.k === 'icon'}
                {#each [0, 1, 2, 3] as i}<rect x={13 + i * 19} y="18" width="13" height="13" rx="3.5" class="tile" /><rect x={14 + i * 19} y="35" width="11" height="2.5" rx="1" class="tile" />{/each}
              {:else}
                {@const n = [0, 5, 4, 3, 2][si]!}
                {@const w = (80 - (n - 1) * 5) / n}
                {#each Array(n) as _, i}<rect x={8 + i * (w + 5)} y={28 - w * 0.31 - 3} width={w} height={w * 0.62} rx="2.5" class="tile" />{/each}
              {/if}
            </svg>
            <span>{s.label}</span>
          </button>
        {/each}
      </div>
    </section>

    <!-- Titles and Pictures side by side: one glance, no scrolling. -->
    <div class="pair">
    <section>
      <h3>Titles</h3>
      <div class="opts three">
        {#each [['show', 'Show'], ['hover', 'On hover'], ['hide', 'Hide']] as [k, label]}
          <button class="opt" class:on={prefs.titles === k} aria-pressed={prefs.titles === k} onclick={() => (prefs.titles = k as typeof prefs.titles)}>
            <svg viewBox="0 0 96 56" aria-hidden="true">
              <rect width="96" height="56" rx="6" class="bg" />
              <rect x="30" y="12" width="36" height="22" rx="3" class="tile" />
              {#if k === 'show'}<rect x="34" y="40" width="28" height="4" rx="2" class="txt" />{/if}
              {#if k === 'hover'}<rect x="34" y="40" width="28" height="4" rx="2" class="txt" opacity="0.35" /><path d="M66 30l6 10-3-1-2 4-2-1 2-4-3 0z" class="txt" />{/if}
            </svg>
            <span>{label}</span>
          </button>
        {/each}
      </div>
    </section>
    <section>
      <h3>Pictures</h3>
      <div class="opts three">
        {#each [['cover', 'Cover'], ['logo', 'Logo'], ['shot', 'Screenshot']] as [k, label]}
          <button class="opt" class:on={prefs.pictures === k} aria-pressed={prefs.pictures === k} onclick={() => (prefs.pictures = k as typeof prefs.pictures)}>
            <svg viewBox="0 0 96 56" aria-hidden="true">
              <rect width="96" height="56" rx="6" class="bg" />
              <rect x="22" y="9" width="52" height="38" rx="4" class="tile" />
              {#if k === 'cover'}<path d="M22 38l14-12 10 8 8-6 20 14v1a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4z" class="txt" opacity="0.55" /><circle cx="60" cy="19" r="4" class="txt" opacity="0.55" />{/if}
              {#if k === 'logo'}<rect x="40" y="20" width="16" height="16" rx="4" class="txt" />{/if}
              {#if k === 'shot'}<rect x="26" y="13" width="44" height="4" rx="1" class="txt" opacity="0.6" /><rect x="26" y="21" width="20" height="18" rx="1" class="txt" opacity="0.4" /><rect x="50" y="21" width="20" height="3" rx="1" class="txt" opacity="0.4" /><rect x="50" y="27" width="16" height="3" rx="1" class="txt" opacity="0.4" /><rect x="50" y="33" width="18" height="3" rx="1" class="txt" opacity="0.4" />{/if}
            </svg>
            <span>{label}</span>
          </button>
        {/each}
      </div>
    </section>
    </div>
    {#if prefs.pictures === 'shot'}
      <p class="shotnote">
        Taken when you visit a site.
        <button class="link" disabled={capturing} onclick={async () => { capturing = true; const n = await oncaptureall(); capturing = false; captured = n; }}>
          {capturing ? 'Taking screenshots…' : 'Take them all now'}
        </button>
        {#if captured !== null && !capturing}<span>· {captured} updated</span>{/if}
      </p>
    {/if}

  {:else if tab === 'wallpaper'}
    <section>
      <div class="opts five">
        <button class="opt" class:on={wk === 'none'} onclick={() => set({ kind: 'none' })}><span class="sw" style:background={dark ? '#18191c' : '#f5f6f8'}></span><span>None</span></button>
        <button class="opt" class:on={wk === 'color'} onclick={() => setColor(lastColor)}><span class="sw" style:background={lastColor}></span><span>Colour</span></button>
        <button class="opt" class:on={wk === 'gradient'} onclick={() => setGradient(lastGradient.colors)}><span class="sw" style:background={grad(lastGradient)}></span><span>Gradient</span></button>
        <button class="opt" class:on={wk === 'image'} onclick={() => file?.click()}>
          <span class="sw pic"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/></svg></span><span>Picture</span>
        </button>
        <button class="opt" class:on={wk === 'daily'} onclick={() => set({ kind: 'daily', provider: lastProvider })}>
          <span class="sw pic"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></span><span>Daily</span>
        </button>
      </div>
      <input bind:this={file} type="file" accept="image/*" hidden onchange={() => file?.files?.[0] && onwallpaper(file.files[0])} />

      {#if wk === 'color'}
        <div class="sub"><input type="color" value={lastColor} oninput={(e) => setColor((e.currentTarget as HTMLInputElement).value)} aria-label="Wallpaper colour" /><code>{lastColor}</code></div>
      {:else if wk === 'gradient'}
        <div class="sub">
          {#each lastGradient.colors as c, i}
            <input type="color" value={c} aria-label="Gradient colour {i + 1}" oninput={(e) => { const cs = [...lastGradient.colors]; cs[i] = (e.currentTarget as HTMLInputElement).value; setGradient(cs); }} />
          {/each}
          {#if lastGradient.colors.length < 4}<button class="mini" aria-label="Add a colour" onclick={() => setGradient([...lastGradient.colors, '#f5a524'])}>+</button>{/if}
          {#if lastGradient.colors.length > 2}<button class="mini" aria-label="Remove a colour" onclick={() => setGradient(lastGradient.colors.slice(0, -1))}>−</button>{/if}
          <span class="angle" style:--a="{lastGradient.angle}deg" aria-hidden="true"></span>
          <input type="range" min="0" max="360" step="15" value={lastGradient.angle} aria-label="Gradient angle" oninput={(e) => setGradient(lastGradient.colors, +(e.currentTarget as HTMLInputElement).value)} />
        </div>
      {:else if wk === 'daily'}
        <!-- Today's picture from each source, to pick by eye. Only Unsplash has more than one a day, so only it gets ↻. -->
        <div class="daily">
          {#each Object.entries(providers) as [k, label] (k)}
            {@const d = k === lastProvider && daily ? daily : previews[k as Provider]}
            <div class="dcard" class:on={lastProvider === k}>
              <button class="dpick" aria-pressed={lastProvider === k} onclick={() => { lastProvider = k as Provider; set({ kind: 'daily', provider: lastProvider }); }}>
                {#if d}<img src={previewOf(d.url)} alt="" />{:else}<span class="dload">{previews[k as Provider] === null ? 'Unavailable today' : 'Loading…'}</span>{/if}
                <span class="dname">{label}</span>
              </button>
              {#if k === 'picsum'}
                <button class="dnew" aria-label="New Unsplash picture" title="New picture"
                  onclick={() => { if (lastProvider !== 'picsum') { lastProvider = 'picsum'; set({ kind: 'daily', provider: 'picsum' }); } onrefreshdaily(); }}>
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" /></svg>
                </button>
              {/if}
            </div>
          {/each}
        </div>
        {#if daily}<p class="credit">{#if daily.link}<a href={daily.link} target="_blank" rel="noreferrer">{daily.credit}</a>{:else}{daily.credit}{/if}</p>{/if}
      {/if}
    </section>

  {:else}
    <section class="list">
      <div class="li">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="4" height="14" rx="1"/><rect x="10" y="5" width="4" height="14" rx="1"/><rect x="17" y="5" width="4" height="14" rx="1"/></svg>
        <span>Columns</span>
        <div class="stepper">
          <button aria-label="Fewer columns" onclick={() => (prefs.maxColumns = prefs.maxColumns === 0 ? 9 : Math.max(2, prefs.maxColumns - 1))}>−</button>
          <span class="val">{prefs.maxColumns || 'Auto'}</span>
          <button aria-label="More columns" onclick={() => (prefs.maxColumns = prefs.maxColumns === 0 || prefs.maxColumns >= 10 ? 0 : prefs.maxColumns + 1)}>+</button>
        </div>
      </div>
      {#each [['search', 'Search button', 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5'], ['addButton', 'Add button', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v8M8 12h8'], ['clock', 'Clock', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2'], ['vim', 'Vim keys  h j k l', 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10']] as [k, label, d]}
        <label class="li">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path {d} /></svg>
          <span>{label}</span>
          <input type="checkbox" role="switch" bind:checked={prefs[k as 'search' | 'addButton' | 'clock' | 'vim']} />
        </label>
      {/each}
      <button class="li" onclick={onpickfolder}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
        <span>Dial folder</span>
        <span class="fname">{folderLabel} ›</span>
      </button>
    </section>
  {/if}
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; border: 0; background: rgb(0 0 0 / 0.12); z-index: 30; cursor: default; } /* no blur: you see changes live */
  .sheet {
    /* The sheet is a shade off the surface; each group of settings sits on its own card in the surface colour. */
    --sheet: color-mix(in srgb, var(--surface) 93%, var(--text)); --s: var(--surface); --t: var(--text); --m: var(--muted); --l: color-mix(in srgb, var(--text) 12%, transparent); --bgmini: var(--surface-2);
    --tilemini: color-mix(in srgb, var(--text) 22%, var(--surface));
    position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(780px, calc(100vw - 32px)); max-height: 86vh; z-index: 31; box-sizing: border-box;
    display: flex; flex-direction: column; background: color-mix(in srgb, var(--sheet) var(--float-alpha), transparent); backdrop-filter: var(--float-blur); color: var(--t); border-radius: calc(var(--radius) * 1.4) calc(var(--radius) * 1.4) 0 0; box-shadow: 0 -10px 40px rgb(0 0 0 / 0.2);
    padding: 8px 0 0; font: 13px/1.3 var(--font-family); animation: up 0.2s ease-out;
  }
  @keyframes up { from { transform: translate(-50%, 24px); opacity: 0; } }
  .sheet.dark { --sheet: color-mix(in srgb, var(--surface) 72%, #000); }
  @media (prefers-reduced-motion: reduce) { .sheet { animation: none; } }
  .grab { flex: none; width: 36px; height: 4px; border-radius: 2px; background: var(--l); margin: 0 auto 4px; }
  /* Four equal tabs across the full width: clear where you are, easy to hit. */
  .tabs { display: grid; grid-template-columns: repeat(4, 1fr); padding: 4px 0 0; border-bottom: 1px solid var(--l); }
  .tabs button { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 8px; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px; background: none; color: var(--m); font: inherit; font-size: 14px; font-weight: 500; cursor: pointer; }
  .tabs button.on { color: var(--t); border-bottom-color: var(--ring); font-weight: 600; }
  .tabs button:hover { color: var(--t); background: color-mix(in srgb, var(--t) 4%, transparent); }
  .panel { padding: 12px 20px 20px; height: 392px; overflow-y: auto; box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; }
  .panel section, .themerow { margin: 0; padding: 12px 14px 14px; border-radius: 12px; background: var(--s); box-shadow: 0 0 0 1px var(--l); }
  .panel h3 { margin: 0 0 10px; }
  .panel .pair { gap: 12px; }
  .panel .shotnote { margin: -4px 4px 0; }
  h3 { margin: 14px 0 8px; font-size: 12px; font-weight: 600; color: var(--m); }
  .opts { display: grid; gap: 8px; }
  .three { grid-template-columns: repeat(3, 1fr); }
  .five { grid-template-columns: repeat(5, 1fr); }
  .themes { grid-template-columns: repeat(auto-fill, minmax(124px, 1fr)); }
  .themerow { display: flex; align-items: center; gap: 16px; }
  .seg { display: inline-flex; padding: 3px; gap: 2px; border-radius: 999px; background: var(--bgmini); }
  .seg button { display: flex; align-items: center; gap: 6px; padding: 6px 14px; border: 0; border-radius: 999px; background: none; color: var(--m); font: inherit; cursor: pointer; }
  .seg button.on { background: var(--s); color: var(--t); box-shadow: 0 1px 3px rgb(0 0 0 / 0.15); }
  .seg button:hover { color: var(--t); }
  .note { color: var(--m); }
  .glass { margin-left: auto; display: flex; align-items: center; gap: 12px; cursor: pointer; text-align: right; }
  .glass .hint { display: block; }
  .tp { display: flex; flex-direction: column; gap: 6px; width: 100%; aspect-ratio: 4 / 3; box-sizing: border-box; padding: 8px; border-radius: 6px; box-shadow: 0 0 0 1px var(--l); overflow: hidden; }
  .tpbar { display: flex; gap: 6px; font-size: 9px; letter-spacing: 0.04em; }
  .tpbar i { font-style: normal; }
  .tpgrid { flex: 1; display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
  .hint { display: block; color: var(--m); font-size: 12px; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .shotnote { margin: 10px 0 0; color: var(--m); font-size: 12px; }
  .link { border: 0; background: none; padding: 0; color: var(--ring); font: inherit; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
  .link:disabled { color: var(--m); cursor: default; text-decoration: none; }
  .opts { gap: 10px; }
  .opt { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 5px; border: 2px solid transparent; border-radius: 10px; background: none; color: var(--m); font: inherit; font-size: 12px; cursor: pointer; }
  .opt svg { width: 100%; height: auto; border-radius: 6px; box-shadow: 0 0 0 1px var(--l); }
  .opt.on { border-color: var(--ring); color: var(--t); }
  .opt:hover { color: var(--t); }
  .bg { fill: var(--bgmini); }
  .tile { fill: var(--tilemini); }
  .txt { fill: var(--m); }
  .sw { display: grid; place-items: center; width: 100%; aspect-ratio: 96 / 56; border-radius: 6px; box-shadow: 0 0 0 1px var(--l); color: var(--m); }
  .sw.pic { background: var(--bgmini); }
  .opt .sw svg { width: 22px; height: 22px; box-shadow: none; border-radius: 0; }
  .sub { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  .sub input[type='color'] { width: 34px; height: 30px; padding: 0; border: 1px solid var(--l); border-radius: 6px; background: none; cursor: pointer; }
  .sub input[type='range'] { flex: 1; min-width: 120px; accent-color: var(--ring); }
  code { color: var(--m); font-size: 12px; }
  .mini { width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--l); background: none; color: var(--t); cursor: pointer; font-size: 15px; }
  .angle { width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--l); background: conic-gradient(from var(--a), var(--ring) 0 12deg, transparent 12deg); }
  .chip { padding: 5px 12px; border-radius: 999px; border: 1px solid var(--l); background: none; color: var(--m); font: inherit; cursor: pointer; }
  .chip.on { border-color: var(--ring); color: var(--t); background: color-mix(in oklab, var(--ring) 12%, transparent); }
  .daily { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 12px; }
  .dcard { position: relative; }
  .dpick { display: block; width: 100%; padding: 0; border: 2px solid transparent; border-radius: 10px; overflow: hidden; background: var(--bgmini); cursor: pointer; position: relative; aspect-ratio: 16 / 10; }
  .dcard.on .dpick { border-color: var(--ring); }
  .dpick img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .dload { position: absolute; inset: 0; display: grid; place-items: center; font-size: 12px; color: var(--m); }
  .dname { position: absolute; left: 0; right: 0; bottom: 0; padding: 14px 8px 5px; text-align: left; font-size: 12px; font-weight: 600; color: #fff;
    background: linear-gradient(transparent, rgb(0 0 0 / 0.6)); }
  .dnew { position: absolute; top: 6px; right: 6px; width: 28px; height: 28px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%;
    background: rgb(0 0 0 / 0.5); color: #fff; cursor: pointer; backdrop-filter: blur(6px); }
  .dnew:hover { background: rgb(0 0 0 / 0.7); }
  .credit { margin: 8px 0 0; font-size: 11px; color: var(--m); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .credit a { color: inherit; }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 16px; }
  .row > * { justify-content: flex-start; }
  .lbl { color: var(--t); margin-right: auto; }
  .toggle, .stepper { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--l); background: none; color: var(--m); font: inherit; cursor: pointer; min-width: 0; }
  .toggle.on { border-color: var(--ring); color: var(--t); background: color-mix(in oklab, var(--ring) 12%, transparent); }
  .toggle:hover { color: var(--t); }
  .stepper { cursor: default; padding: 3px 6px 3px 12px; }
  .stepper button { width: 24px; height: 24px; border-radius: 50%; border: 0; background: var(--bgmini); color: var(--t); cursor: pointer; }
  .stepper .val { min-width: 32px; text-align: center; color: var(--t); font-variant-numeric: tabular-nums; }
  .folder { grid-column: 1 / -1; }
  .fname { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 160px; }
  :focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }

  .list { display: flex; flex-direction: column; padding-top: 2px !important; padding-bottom: 2px !important; }
  .li { display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 0 4px; border: 0; border-bottom: 1px solid var(--l); background: none; color: var(--t); font: inherit; font-size: 14px; text-align: left; cursor: pointer; }
  .li:last-child { border-bottom: 0; }
  .li > svg { color: var(--m); flex: none; }
  .li > span:first-of-type { flex: 1; }
  .li .stepper { border: 0; padding: 0; gap: 4px; }
  .li .fname { color: var(--m); font-size: 13px; }
  .li:hover > svg { color: var(--t); }
  input[role='switch'] { appearance: none; flex: none; width: 36px; height: 21px; border-radius: 999px; background: var(--l); position: relative; cursor: pointer; margin: 0; transition: background 0.15s; }
  input[role='switch']::after { content: ''; position: absolute; top: 2px; left: 2px; width: 17px; height: 17px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgb(0 0 0 / 0.3); transition: transform 0.15s; }
  input[role='switch']:checked { background: var(--ring); }
  input[role='switch']:checked::after { transform: translateX(15px); }
  /* Phones: the sheet takes the full width, tabs stack icon over label, options wrap, and the panel scrolls. */
  @media (max-width: 599px) {
    .sheet { width: 100vw; border-radius: 14px 14px 0 0; padding-bottom: env(safe-area-inset-bottom); }
    .tabs button { flex-direction: column; gap: 4px; padding: 10px 4px; font-size: 12px; }
    .panel { height: auto; max-height: 64vh; padding: 4px 16px 20px; }
    .five { grid-template-columns: repeat(3, 1fr); }
    .pair { grid-template-columns: 1fr; gap: 0; }
    .themes { grid-template-columns: repeat(2, 1fr); }
    .themerow { flex-wrap: wrap; }
  }
  @media (min-width: 600px) and (max-width: 799px) { .panel { height: auto; max-height: 60vh; } }
</style>
