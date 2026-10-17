<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- A tile's picture: the site's brand picture (og:image, landscape) first; else its sharpest icon,
     reconstructed when small; else the browser's favicon (also reconstructed); else a letter. Icons are part of the
     tile, not a box in it: the tile takes the artwork's own background or a soft tint of its colour (iconlab.tileStyle).
     A per-tile Picture (Edit) can force a page image / icon / upload / URL and a background colour. -->
<script lang="ts">
  import { previewFor, peekPreview, remember, dataUrl, type Preview, type PreviewIcon } from './preview';
  import { analyse, upscale, tileStyle, iconTarget, density } from './iconlab';
  import { browserFavicon, isGenericFavicon } from './bm';
  import { host, hue } from './shared';
  import { defaultPicture, type Picture } from './pictures.svelte';
  import { epoch, prefs } from './prefs.svelte';
  import { peekShot, shotsVersion } from './shots.svelte';

  let {
    url, title, picture = defaultPicture, dark = false, iconOnly = false, onkind,
  }: {
    url: string; title: string; picture?: Picture; dark?: boolean; iconOnly?: boolean;
    onkind?: (k: { mode: 'icon' | 'photo' | 'letter'; hasPageImage: boolean; hasLogo: boolean }) => void;
  } = $props();

  // Cached pictures are read synchronously, so a reload draws the same tile at once, with no letter flash.
  let p = $state<Preview>(peekPreview(url) ?? {});
  let imageOk = $state(true);
  let squareImage = $state(false); // a "page image" that is really a square logo (e.g. YouTube) → use the icon
  let fav = $state<PreviewIcon | null>(peekPreview(`fav:${url}`)?.icons?.[0] ?? null);

  $effect(() => {
    void epoch.n;
    const u = url;
    previewFor(u).then((v) => {
      p = v;
      // The browser's favicon, only when the page gave us no icon; reconstructed once, then cached.
      if (v.icons?.length || peekPreview(`fav:${u}`)) return;
      const f = browserFavicon(u, 64);
      if (f)
        fetch(f).then((r) => r.blob()).then(async (b) => {
          if (await isGenericFavicon(b, 64)) return;
          const big = await upscale(b, iconTarget());
          const info = await analyse(big);
          if (!info) return;
          fav = { src: await dataUrl(big), px: 64, info };
          remember(`fav:${u}`, { icons: [fav] });
        }).catch(() => {});
    });
  });

  const pageImage = $derived(imageOk ? p.imageData ?? p.image : undefined);
  const icon = $derived<PreviewIcon | null>(p.icons?.[0] ?? fav);
  const chosenIcon = $derived.by((): PreviewIcon | undefined => {
    if (picture.source !== 'icon' || !picture.src) return undefined;
    return p.icons?.find((i) => i.src === picture.src) ?? { src: picture.src, px: 64 };
  });
  // A screenshot of the page, when one has been taken (Screenshot pictures).
  const shot = $derived((void shotsVersion.n, peekShot(url)));
  // What the tile shows: the choice made in Edit, else the Pictures setting (cover → logo, logo, screenshot → cover → logo).
  const want = $derived(picture.source !== 'auto' ? picture.source : prefs.pictures === 'cover' ? 'image' : prefs.pictures === 'shot' ? 'shot' : 'icon');
  const photoSrc = $derived.by(() => {
    if (iconOnly && picture.source === 'auto') return undefined;
    if ((want === 'upload' || want === 'url') && picture.src) return picture.src;
    if (want === 'image') return picture.source === 'image' && picture.src ? picture.src : pageImage && !(squareImage && icon) ? pageImage : undefined;
    if (want === 'shot') return shot ?? (picture.source === 'auto' && pageImage && !(squareImage && icon) ? pageImage : undefined);
    return undefined;
  });
  const mode = $derived<'icon' | 'photo' | 'letter'>(photoSrc ? 'photo' : chosenIcon || icon ? 'icon' : 'letter');
  const shown = $derived(chosenIcon ?? icon);
  $effect(() => onkind?.({ mode, hasPageImage: !!pageImage, hasLogo: !!icon }));

  const look = $derived(tileStyle(shown?.info, dark));
  const full = $derived(!!shown?.info?.bleed && !!shown.info.edge); // artwork with a flat background: extend it
  const h = $derived(hue(url));
  const bg = $derived(
    mode === 'photo' ? undefined
      : picture.plate !== 'auto' ? picture.plate
      : mode === 'icon' ? look.bg
      : dark ? `hsl(${h} 22% 22%)` : `hsl(${h} 45% 93%)`,
  );
  // Size on the tile: a share of the tile's height; small un-reconstructed sources are never enlarged past 2×.
  const size = $derived(iconOnly ? (full || look.boxed ? 100 : 62) : full ? 54 : look.boxed ? 50 : 44);
  const letter = $derived((title || host(url)).trim().charAt(0).toUpperCase());
</script>

<span class="frame" class:solo={iconOnly} style:background={bg}>
  {#if photoSrc}
    <img
      class="photo" src={photoSrc} alt=""
      onerror={() => (imageOk = false)}
      onload={(e) => { const i = e.currentTarget as HTMLImageElement; squareImage = i.naturalWidth / i.naturalHeight < 1.3; }}
    />
  {:else if mode === 'icon' && shown}
    <img
      class="icon" class:boxed={look.boxed && !iconOnly} class:invert={look.invert} src={shown.src} alt=""
      style:height="{size}%" style:max-height="{shown.px >= 160 ? 'none' : `${(shown.px * 2) / density()}px`}"
    />
  {:else}
    <span class="letter" style:color={dark ? `hsl(${h} 35% 78%)` : `hsl(${h} 40% 38%)`}>{letter}</span>
  {/if}
</span>

<style>
  .frame { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .photo { width: 100%; height: 100%; object-fit: cover; object-position: top center; display: block; }
  .icon { aspect-ratio: 1; width: auto; min-height: 0; object-fit: contain; display: block; flex: none; }
  .icon.boxed { border-radius: 22%; }
  .icon.invert { filter: invert(1); }
  .solo .icon { border-radius: 0; }
  .letter { font: 600 clamp(20px, calc(var(--tile) * 0.14), 40px) / 1 system-ui, sans-serif; }
  .solo .letter { font-size: 26px; }
</style>
