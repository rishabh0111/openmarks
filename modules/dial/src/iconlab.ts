// SPDX-License-Identifier: GPL-3.0-or-later
// Icon analysis and reconstruction, all local:
// - analyse(): size, edge colour, accent, light/dark share, monochrome, flat-colour, so a tile can take the icon's own
//   background and the icon blends into the tile instead of sitting in a box;
// - upscale(): Lanczos-3 resampling in premultiplied alpha, then (for flat-colour logos, which most icons are)
//   palette snapping and alpha-edge tightening, which rebuilds crisp edges from a 16–48 px favicon.

export type Tone = 'dark' | 'light' | 'mixed';

/** Device pixels per CSS pixel, rounded up to a step (1, 1.5, 2, 3…), for sizing stored images on HiDPI screens. */
export const density = () => Math.min(4, Math.ceil((globalThis.devicePixelRatio || 1) * 2) / 2);
/** Icon size worth keeping for this screen: icons show at up to ~128 CSS px, so 256 px at 1×, 512 px from 2×. */
export const iconTarget = () => (density() >= 1.5 ? 512 : 256);
export type IconInfo = {
  px: number; tone: Tone;
  bleed: boolean; // artwork reaches the edges (full square logo) vs. a glyph on transparency
  edge?: string; // the artwork's background colour when it bleeds and the edge is uniform
  accent: string; // dominant colour of the artwork
  darkShare: number; lightShare: number; // fraction of opaque pixels that are near-black / near-white
  mono: boolean; // single neutral colour (black or white glyph)
};

type Decoded = { img: CanvasImageSource; w: number; h: number };

/** Decode any image the browser can (PNG, ICO, WebP, SVG without intrinsic size). */
export async function decode(blob: Blob): Promise<Decoded> {
  if (!/svg/.test(blob.type)) {
    try {
      const b = await createImageBitmap(blob);
      return { img: b, w: b.width, h: b.height };
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const im = new Image();
    im.src = url;
    await im.decode();
    const svg = /svg/.test(blob.type);
    return { img: im, w: svg ? 512 : im.naturalWidth, h: svg ? 512 : im.naturalHeight };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function pixels(d: Decoded, n: number): Uint8ClampedArray {
  const c = new OffscreenCanvas(n, n);
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(d.img, 0, 0, n, n);
  return x.getImageData(0, 0, n, n).data;
}

const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const lumOf = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export async function analyse(blob: Blob, isSvg = false): Promise<IconInfo | null> {
  try {
    const d = await decode(blob);
    const N = 64;
    const p = pixels(d, N);
    let n = 0, transparent = 0, lum = 0, chroma = 0, dark = 0, light = 0;
    let sr = 0, sg = 0, sb = 0;
    const hues = new Map<number, [number, number, number, number]>(); // coarse colour buckets of saturated pixels
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3]! < 40) { transparent++; continue; }
      const r = p[i]!, g = p[i + 1]!, b = p[i + 2]!;
      const l = lumOf(r, g, b), c = Math.max(r, g, b) - Math.min(r, g, b);
      lum += l; chroma += c; n++;
      if (l < 60) dark++;
      if (l > 205) light++;
      sr += r; sg += g; sb += b;
      if (c > 40) {
        const k = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
        const e = hues.get(k) ?? [0, 0, 0, 0];
        e[0] += r; e[1] += g; e[2] += b; e[3]++;
        hues.set(k, e);
      }
    }
    if (!n) return null;
    // Edge: the middle half of each side, 2 px in (skips rounded corners and 1 px borders).
    const ring: number[] = [];
    for (let k = N / 4; k < (3 * N) / 4; k++) for (const [x, y] of [[k, 2], [k, N - 3], [2, k], [N - 3, k]] as const) ring.push((y * N + x) * 4);
    const opaqueRing = ring.filter((i) => p[i + 3]! > 200);
    const bleed = opaqueRing.length > ring.length * 0.9;
    let edge: string | undefined;
    if (bleed) {
      const m = [0, 1, 2].map((k) => opaqueRing.reduce((s, i) => s + p[i + k]!, 0) / opaqueRing.length);
      const spread = opaqueRing.reduce((s, i) => s + Math.abs(p[i]! - m[0]!) + Math.abs(p[i + 1]! - m[1]!) + Math.abs(p[i + 2]! - m[2]!), 0) / opaqueRing.length;
      if (spread < 24) edge = hex(m[0]!, m[1]!, m[2]!);
    }
    const avgL = lum / n, avgC = chroma / n;
    const tone: Tone = transparent < 256 || avgC > 60 ? 'mixed' : avgL < 80 ? 'dark' : avgL > 190 ? 'light' : 'mixed';
    return {
      px: isSvg ? 512 : Math.min(d.w, d.h), tone, bleed, edge,
      // The most common saturated colour (an average of a multi-colour logo is mud).
      accent: (() => { const top = [...hues.values()].sort((a, b) => b[3] - a[3])[0]; return top && top[3] > n * 0.04 ? hex(top[0] / top[3], top[1] / top[3], top[2] / top[3]) : hex(sr / n, sg / n, sb / n); })(),
      darkShare: dark / n, lightShare: light / n,
      mono: avgC < 18 && transparent >= 256,
    };
  } catch {
    return null;
  }
}

// ── Upscaling ────────────────────────────────────────────────────────────────

const lanczos = (x: number) => (x === 0 ? 1 : Math.abs(x) >= 3 ? 0 : (3 * Math.sin(Math.PI * x) * Math.sin((Math.PI * x) / 3)) / (Math.PI * Math.PI * x * x));

/** One separable Lanczos-3 pass on premultiplied float RGBA. */
function resample(src: Float32Array, w: number, h: number, W: number, H: number, horizontal: boolean): Float32Array {
  const ow = horizontal ? W : w, oh = horizontal ? h : H;
  const out = new Float32Array(ow * oh * 4);
  const inLen = horizontal ? w : h, outLen = horizontal ? W : H, scale = outLen / inLen;
  for (let o = 0; o < outLen; o++) {
    const c = (o + 0.5) / scale - 0.5, lo = Math.floor(c) - 2;
    const taps: [number, number][] = [];
    let sum = 0;
    for (let i = lo; i < lo + 6; i++) { const wt = lanczos(c - i); taps.push([Math.min(inLen - 1, Math.max(0, i)), wt]); sum += wt; }
    for (let q = 0; q < (horizontal ? oh : ow); q++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (const [i, wt] of taps) {
        const s = (horizontal ? q * w + i : i * w + q) * 4;
        r += src[s]! * wt; g += src[s + 1]! * wt; b += src[s + 2]! * wt; a += src[s + 3]! * wt;
      }
      const d = (horizontal ? q * ow + o : o * ow + q) * 4;
      out[d] = r / sum; out[d + 1] = g / sum; out[d + 2] = b / sum; out[d + 3] = a / sum;
    }
  }
  return out;
}

/** Separable Gaussian blur on premultiplied float RGBA. */
function blur(src: Float32Array, W: number, H: number, sigma: number): Float32Array {
  const rad = Math.ceil(sigma * 2.5), k: number[] = [];
  let sum = 0;
  for (let i = -rad; i <= rad; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(v); sum += v; }
  for (let i = 0; i < k.length; i++) k[i]! /= sum;
  const pass = (inp: Float32Array, horizontal: boolean) => {
    const out = new Float32Array(inp.length);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let j = -rad; j <= rad; j++) {
          const xx = horizontal ? Math.min(W - 1, Math.max(0, x + j)) : x, yy = horizontal ? y : Math.min(H - 1, Math.max(0, y + j));
          const s = (yy * W + xx) * 4, wt = k[j + rad]!;
          r += inp[s]! * wt; g += inp[s + 1]! * wt; b += inp[s + 2]! * wt; a += inp[s + 3]! * wt;
        }
        const d = (y * W + x) * 4;
        out[d] = r; out[d + 1] = g; out[d + 2] = b; out[d + 3] = a;
      }
    return out;
  };
  return pass(pass(src, true), false);
}

/** Up to 8 dominant colours, if the icon is flat-colour (they cover ≥ 85 % of its opaque pixels); else null. */
function palette(d: Uint8ClampedArray, w: number, h: number): number[][] | null {
  // Only pixels inside flat areas or along thin lines count: the anti-aliased in-between shades on
  // edges are blends, not logo colours, and treating them as colours paints bands around every shape.
  const same = (i: number, j: number) => Math.abs(d[i]! - d[j]!) + Math.abs(d[i + 1]! - d[j + 1]!) + Math.abs(d[i + 2]! - d[j + 2]!) + Math.abs(d[i + 3]! - d[j + 3]!) < 28;
  const buckets = new Map<number, [number, number, number, number]>();
  let opaque = 0, flat = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3]! < 200) continue;
      opaque++;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) continue;
      // solid: matches both neighbours along a row or along a column (keeps 1–2 px lines, skips edge blends)
      if (!((same(i, i - 4) && same(i, i + 4)) || (same(i, i - w * 4) && same(i, i + w * 4)))) continue;
      flat++;
      const k = ((d[i]! >> 4) << 8) | ((d[i + 1]! >> 4) << 4) | (d[i + 2]! >> 4);
      const e = buckets.get(k) ?? [0, 0, 0, 0];
      e[0] += d[i]!; e[1] += d[i + 1]!; e[2] += d[i + 2]!; e[3]++;
      buckets.set(k, e);
    }
  if (!flat || flat < opaque * 0.4) return null; // mostly texture or gradient: not a flat logo
  const cols = [...buckets.values()].sort((a, b) => b[3] - a[3]).map(([r, g, b, c]) => ({ col: [r / c, g / c, b / c], c }));
  const dist = (p: number[], q: number[]) => Math.abs(p[0]! - q[0]!) + Math.abs(p[1]! - q[1]!) + Math.abs(p[2]! - q[2]!);
  const pal: number[][] = [];
  for (const { col, c } of cols) if (pal.length < 8 && c >= flat * 0.003 && !pal.some((p) => dist(p, col) < 48)) pal.push(col);
  // Safety: every opaque pixel must be a logo colour or a blend of two (near the line between them). If anything
  // isn't (a gradient, a shadow, a detail we missed), don't rebuild edges at all, so no feature can be erased.
  const nearSeg = (q: number[], a: number[], b: number[]) => {
    const ab = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], aq = [q[0]! - a[0]!, q[1]! - a[1]!, q[2]! - a[2]!];
    const L = ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2, t = L ? Math.max(0, Math.min(1, (aq[0]! * ab[0]! + aq[1]! * ab[1]! + aq[2]! * ab[2]!) / L)) : 0;
    return Math.hypot(aq[0]! - ab[0]! * t, aq[1]! - ab[1]! * t, aq[2]! - ab[2]! * t) < 30;
  };
  let explained = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! < 200) continue;
    const q = [d[i]!, d[i + 1]!, d[i + 2]!];
    if (pal.some((a, ai) => dist(a, q) < 48 || pal.some((b, bi) => bi > ai && nearSeg(q, a, b)))) explained++;
  }
  return pal.length && explained / opaque >= 0.985 ? pal : null;
}

/**
 * Upscale a small raster icon to `target` px. Lanczos-3 keeps geometry; for flat-colour logos each pixel is then
 * pulled to its nearest logo colour and the alpha ramp tightened, so edges come out crisp rather than soft.
 */
export async function upscale(blob: Blob, target = 256): Promise<Blob> {
  const dec = await decode(blob);
  const w = dec.w, h = dec.h;
  const c0 = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true })!;
  c0.drawImage(dec.img, 0, 0);
  const raw = c0.getImageData(0, 0, w, h).data;
  const scale = target / Math.max(w, h);
  const W = Math.round(w * scale), H = Math.round(h * scale);
  const pre = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i += 4) {
    const a = raw[i + 3]! / 255;
    pre[i] = raw[i]! * a; pre[i + 1] = raw[i + 1]! * a; pre[i + 2] = raw[i + 2]! * a; pre[i + 3] = a;
  }
  let big = resample(resample(pre, w, h, W, H, true), W, h, W, H, false);
  const pal = palette(raw, w, h);
  if (pal) {
    // Flat-colour logo: blur by ~half a source pixel so the source's pixel staircase becomes a smooth outline, then
    // rebuild crisp edges along that outline (below). This is what removes jagged curves and diagonals.
    big = blur(big, W, H, Math.max(1, scale * 0.55));
  }
  const out = new ImageData(W, H);
  const o = out.data;
  // Edge sharpness in output pixels: a ~1.5 px anti-aliased boundary at the size the icon is shown, wider at 512 px
  // because the icon is drawn smaller than that.
  const w2 = 0.18;
  for (let i = 0; i < big.length; i += 4) {
    let a = Math.min(1, Math.max(0, big[i + 3]!));
    let r = a > 0.004 ? big[i]! / a : 0, g = a > 0.004 ? big[i + 1]! / a : 0, b = a > 0.004 ? big[i + 2]! / a : 0;
    if (pal) {
      // The two nearest logo colours; t = how far this pixel sits from the nearest towards the second (0 … 0.5).
      let p1 = pal[0]!, p2 = pal[0]!, d1 = Infinity, d2 = Infinity;
      for (const p of pal) {
        const dd = Math.sqrt((p[0]! - r) ** 2 + (p[1]! - g) ** 2 + (p[2]! - b) ** 2);
        if (dd < d1) { d2 = d1; p2 = p1; d1 = dd; p1 = p; } else if (dd < d2) { d2 = dd; p2 = p; }
      }
      const t = d1 + d2 > 0 ? d1 / (d1 + d2) : 0;
      // Flat areas (t near 0) snap fully to their colour; the boundary (t near 0.5) keeps a narrow, smooth blend.
      const e = Math.min(1, Math.max(0, (t - (0.5 - w2)) / w2)), k = 0.5 * e * e * (3 - 2 * e);
      r = p1[0]! + (p2[0]! - p1[0]!) * k; g = p1[1]! + (p2[1]! - p1[1]!) * k; b = p1[2]! + (p2[2]! - p1[2]!) * k;
      // Transparency: the same treatment around the smoothed outline (50 % coverage = the edge).
      const ta = Math.min(1, Math.max(0, (a - (0.5 - w2)) / (2 * w2)));
      a = ta * ta * (3 - 2 * ta);
    }
    o[i] = r; o[i + 1] = g; o[i + 2] = b; o[i + 3] = a * 255;
  }
  const cv = new OffscreenCanvas(W, H);
  cv.getContext('2d')!.putImageData(out, 0, 0);
  return cv.convertToBlob({ type: 'image/png' });
}

// ── Tile colouring ──────────────────────────────────────────────────────────

/**
 * How an icon sits on its tile so it reads as one piece: the tile takes the artwork's own background (full-bleed
 * logos) or a soft tint of its colour (glyphs). Black/white glyphs are inverted rather than boxed when they'd vanish.
 */
export function tileStyle(info: IconInfo | undefined, dark: boolean): { bg: string; invert: boolean; boxed: boolean } {
  const base = dark ? '#1d1f23' : '#ffffff';
  if (!info) return { bg: dark ? '#26282d' : '#f3f4f6', invert: false, boxed: false };
  if (info.bleed) return info.edge ? { bg: info.edge, invert: false, boxed: false } : { bg: `color-mix(in oklab, ${info.accent} ${dark ? 22 : 12}%, ${base})`, invert: false, boxed: true };
  if (info.mono) return { bg: dark ? '#26282d' : '#f3f4f6', invert: dark ? info.tone === 'dark' : info.tone === 'light', boxed: false };
  // Mostly-black art in dark mode gets a light tile; mostly-white art in light mode a slightly deeper one.
  if (dark && info.darkShare > 0.3) return { bg: `color-mix(in oklab, ${info.accent} 12%, #f2f3f5)`, invert: false, boxed: false };
  if (!dark && info.lightShare > 0.45) return { bg: `color-mix(in oklab, ${info.accent} 8%, #e9ebef)`, invert: false, boxed: false };
  return { bg: `color-mix(in oklab, ${info.accent} ${dark ? 16 : 10}%, ${base})`, invert: false, boxed: false };
}
