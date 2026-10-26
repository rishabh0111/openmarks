// SPDX-License-Identifier: GPL-3.0-or-later
// Theme engine: a theme is tokens, never code, so community themes can be shared safely (store review: no remote
// code) and every theme is checked for readability before it is applied. The engine turns tokens into CSS custom
// properties on the page; components only ever read those variables. A theme can also come as a CSS file of your
// own (see "Your own theme" below): its custom properties are read back into tokens and go through the same engine.

export type Scheme = {
  bg: string; // page background when no wallpaper: a colour or a gradient
  surface: string; // tiles, menus, sheet (opaque)
  surface2: string; plate: string; hover: string;
  text: string; muted: string; line: string; ring: string; danger: string;
  shadow: string; shadowHover: string;
};

export type Theme = {
  id: string; name: string; author: string; version: 1;
  /** At least one scheme. A dark-only theme (Vapor) is dark in light mode too; a light-only one (Retro 98) the reverse. */
  light?: Scheme; dark?: Scheme;
  shape: {
    radius: number; // 0–24 px tile corners
    notch?: number; // cut corner, px (sci-fi look); 0 = none
    border?: { width: 1 | 2; style: 'solid' | 'outset' }; // 'outset' = the bevelled 90s edge
  };
  /** What a tile does under the pointer: rise, glow, and optionally light up its title bar. */
  hover: { lift: number; scale?: number; shadow: string; edge?: string; title?: { bg: string; text: string } };
  type: {
    font: 'system' | 'mono' | 'geometric' | 'retro'; // system font stacks only: no downloads
    weight: 500 | 600 | 700; // current folder
  };
  /** The translucent look, used while "Glass" is on in settings. Surface alpha is clamped for readability. */
  glass: { alpha: number; blur: number; saturate: number; edge?: string; glow?: string };
  /** Floating layers (settings, menus, dialogs, toasts): frosted when blur > 0, plus a soft blur on the dimmed page
   *  behind dialogs. Tiles themselves are never blurred. */
  float?: { blur: number; alpha: number; scrim: number };
  /** From a CSS file: properties the engine has no token for, set as written (per scheme), and the file's other rules. */
  vars?: { light?: Record<string, string>; dark?: Record<string, string> };
  css?: string;
  /** From a CSS file: the font stack as written (instead of `type.font`). */
  family?: string;
};

const FONTS: Record<Theme['type']['font'], string> = {
  system: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    mono: "ui-monospace, 'JetBrains Mono', 'Cascadia Code', 'Fira Code', Menlo, monospace",
  geometric: "'Motiva Sans', 'Montserrat', 'Avenir Next', 'Segoe UI', system-ui, sans-serif",
  retro: "Tahoma, 'MS Sans Serif', 'Microsoft Sans Serif', Verdana, Geneva, sans-serif",
};

// ── Readability ──────────────────────────────────────────────────────────────

function rgb(c: string): [number, number, number] | null {
  const ctx = new OffscreenCanvas(1, 1).getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillStyle = c;
  const v = ctx.fillStyle; // normalised: #rrggbb or rgba(...)
  if (v.startsWith('#')) return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)) as [number, number, number];
  const m = v.match(/[\d.]+/g);
  return m ? [Number(m[0]), Number(m[1]), Number(m[2])] : null;
}
const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const L = ([r, g, b]: [number, number, number]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export function contrast(a: string, b: string): number {
  const x = rgb(a), y = rgb(b);
  if (!x || !y) return 21;
  const [hi, lo] = [L(x), L(y)].sort((p, q) => q - p) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Problems that would make a theme hard to read; the engine fixes them rather than refusing the theme. */
export function audit(t: Theme): string[] {
  const out: string[] = [];
  if (!t.light && !t.dark) out.push('a theme needs a light or a dark scheme');
  for (const [k, s] of [['light', t.light], ['dark', t.dark]] as const) {
    if (!s) continue;
    if (contrast(s.text, s.surface) < 4.5) out.push(`${k}: text on tiles is below 4.5:1`);
    if (contrast(s.muted, s.surface) < 3) out.push(`${k}: secondary text on tiles is below 3:1`);
  }
  return out;
}

// ── Engine ───────────────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** CSS variables for the page. `glass` on: translucent surfaces over the wallpaper, never below 70 % opacity, and
 *  text on them gets a faint shadow, readable over any photo. */
export function themeVars(t: Theme, dark: boolean, glass: boolean): Record<string, string> {
  const s = (dark ? t.dark ?? t.light : t.light ?? t.dark)!;
  const own = s === t.dark ? t.vars?.dark : t.vars?.light;
  const text = contrast(s.text, s.surface) >= 4.5 ? s.text : contrast('#ffffff', s.surface) > contrast('#111111', s.surface) ? '#ffffff' : '#111111';
  // Transparency: one frosted material, like the old macOS vibrancy (a strong blur under a mostly opaque surface, so
  // text reads on any wallpaper), in two strengths: the pane for things on the page (folder tabs, search bar, buttons,
  // labels, tiles), the floating one, a little more opaque and blurred more, for what floats over it (search, menus,
  // settings, dialogs, toasts). Off: everything solid.
  const a = clamp(t.glass.alpha, 0.72, 0.9);
  const pane = glass ? `color-mix(in srgb, ${s.surface} ${Math.round(a * 100)}%, transparent)` : s.surface;
  const floatAlpha = glass ? clamp(t.float?.alpha ?? t.glass.alpha + 0.06, 0.8, 0.95) : 1;
  const floatBlur = clamp(t.float?.blur ?? 28, 20, 40);
  const r = clamp(t.shape.radius, 0, 24), notch = clamp(t.shape.notch ?? 0, 0, 20);
  return {
    '--bg': s.bg, '--surface': s.surface, '--pane': pane, '--surface-2': s.surface2, '--plate': s.plate, '--hover': s.hover,
    '--text': text, '--muted': s.muted, '--line': glass && t.glass.edge ? t.glass.edge : s.line, '--ring': s.ring, '--danger': s.danger,
    '--shadow': glass && t.glass.glow ? `${t.glass.glow}, ${s.shadow}` : s.shadow, '--shadow-hover': s.shadowHover,
    '--backdrop': glass ? `blur(${clamp(t.glass.blur, 16, 40)}px) saturate(${clamp(t.glass.saturate, 1.3, 2)})` : 'none',
    '--radius': `${r}px`, '--radius-sm': `${Math.min(r, 8)}px`,
    '--notch': notch ? `polygon(0 0, calc(100% - ${notch}px) 0, 100% ${notch}px, 100% 100%, ${notch}px 100%, 0 calc(100% - ${notch}px))` : 'none',
    '--font-family': t.family ?? FONTS[t.type.font], '--tab-weight': String(t.type.weight),
    '--float-alpha': `${Math.round(floatAlpha * 100)}%`,
    '--float-blur': glass ? `blur(${floatBlur}px) saturate(1.8)` : 'none',
    '--float': glass ? `color-mix(in srgb, ${s.surface} ${Math.round(floatAlpha * 100)}%, transparent)` : s.surface,
    '--card-alpha': glass ? '55%' : '100%', // a card on a floating layer (Settings' page): lighter, the layer is frosted already
    '--scrim-blur': glass && t.float?.scrim ? `blur(${clamp(t.float.scrim, 0, 12)}px)` : 'none',
    '--chrome': pane, '--on-ring': contrast('#ffffff', s.ring) >= contrast('#111111', s.ring) ? '#ffffff' : '#111111',
    '--border': `${t.shape.border?.width ?? 1}px ${t.shape.border?.style ?? 'solid'} ${t.shape.border?.style === 'outset' ? s.surface : 'var(--line)'}`,
    '--hover-lift': `${-clamp(t.hover.lift, 0, 6)}px`, '--hover-scale': String(clamp(t.hover.scale ?? 1, 1, 1.06)),
    '--hover-shadow': t.hover.shadow, '--hover-edge': t.hover.edge ?? 'var(--line)',
    '--hover-title-bg': t.hover.title?.bg ?? pane, '--hover-title-text': t.hover.title?.text ?? text,
    '--text-shadow': glass ? (isDark(t, dark) ? '0 1px 2px rgb(0 0 0 / 0.45)' : '0 1px 1px rgb(255 255 255 / 0.5)') : 'none',
    ...own,
  };
}

/** Whether this theme's scheme is dark (dark-only themes are dark in light mode too). */
export const isDark = (t: Theme, dark: boolean) => (dark ? !!t.dark : !t.light);

// ── Built-in themes ─────────────────────────────────────────────────────────

export const builtIn: Theme[] = [
  {
    id: 'openmarks', name: 'Openmarks', author: 'Openmarks', version: 1,
    light: {
      bg: '#f5f6f8', surface: '#ffffff', surface2: '#f3f4f6', plate: '#f3f4f6', hover: 'rgb(0 0 0 / 0.04)',
      text: '#1f2328', muted: '#5f6673', line: 'rgb(0 0 0 / 0.09)', ring: '#2b2f36', danger: '#c62f2f', // neutral until a wallpaper gives a colour
      shadow: '0 1px 2px rgb(0 0 0 / 0.05), 0 2px 6px rgb(0 0 0 / 0.04)', shadowHover: '0 4px 14px rgb(0 0 0 / 0.1)',
    },
    dark: {
      bg: '#18191c', surface: '#232428', surface2: '#2a2d34', plate: '#2a2d34', hover: 'rgb(255 255 255 / 0.05)',
      text: '#e8e9ec', muted: '#a3a6ae', line: 'rgb(255 255 255 / 0.08)', ring: '#dfe1e6', danger: '#ff8a8a',
      shadow: '0 1px 2px rgb(0 0 0 / 0.35)', shadowHover: '0 6px 18px rgb(0 0 0 / 0.4)',
    },
    shape: { radius: 10 },
    hover: { lift: 3, shadow: '0 12px 28px rgb(0 0 0 / 0.18), 0 3px 8px rgb(0 0 0 / 0.08)' },
    type: { font: 'system', weight: 600 },
    glass: { alpha: 0.78, blur: 18, saturate: 1.4, edge: 'rgb(255 255 255 / 0.18)' },
    float: { blur: 28, alpha: 0.78, scrim: 3 },
  },
  {
    // Vapor: navy, blue-tinted translucent panels, 2 px corners, inset glow.
    id: 'vapor', name: 'Vapor', author: 'Openmarks', version: 1,
    dark: {
      bg: 'radial-gradient(circle at 50% 0%, rgb(94 174 255 / 0.32) 0%, rgb(94 174 255 / 0.08) 30%, rgb(94 174 255 / 0) 65%), #0f1924',
      surface: '#1b2838', surface2: '#2a3f5a', plate: '#16202d', hover: 'rgb(115 150 184 / 0.25)',
      text: '#dfe8f0', muted: '#8f98a0', line: 'rgb(179 218 255 / 0.10)', ring: '#1a9fff', danger: '#ff6b6b',
      shadow: '0 3px 6px rgb(0 0 0 / 0.24), inset 0 -2px 10px rgb(30 62 92 / 0.35)', shadowHover: '0 0 0 1px rgb(102 192 244 / 0.5), 0 6px 16px rgb(0 0 0 / 0.4)',
    },
    shape: { radius: 2 },
    // Vapor tiles don't jump: they brighten, with a sky-blue edge, and the title bar turns steel blue.
    hover: { lift: 0, scale: 1.02, shadow: '0 0 0 1px #66c0f4, 0 8px 22px rgb(0 0 0 / 0.5)', edge: '#66c0f4', title: { bg: 'linear-gradient(90deg, #3d6c8d, #2a475e)', text: '#ffffff' } },
    type: { font: 'geometric', weight: 700 },
    glass: { alpha: 0.78, blur: 10, saturate: 1.2, edge: 'rgb(179 218 255 / 0.14)', glow: 'inset 0 1px 0 rgb(179 218 255 / 0.08)' },
    float: { blur: 10, alpha: 0.9, scrim: 2 },
  },
  {
    // Cyberpunk: near-black, neon cyan edges, magenta glow, cut corners, mono type.
    id: 'cyberpunk', name: 'Cyberpunk', author: 'Openmarks', version: 1,
    dark: {
      bg: 'linear-gradient(rgb(0 240 255 / 0.05) 1px, transparent 1px) 0 0 / 32px 32px, linear-gradient(90deg, rgb(0 240 255 / 0.05) 1px, transparent 1px) 0 0 / 32px 32px, radial-gradient(circle at 80% 0%, rgb(255 42 109 / 0.25), transparent 50%), #0a0a12',
      surface: '#12121f', surface2: '#1b1b2e', plate: '#0e0e19', hover: 'rgb(0 240 255 / 0.08)',
      text: '#e6fbff', muted: '#8fb8c4', line: 'rgb(0 240 255 / 0.35)', ring: '#fcee0a', danger: '#ff2a6d',
      shadow: '0 0 0 1px rgb(0 240 255 / 0.25), 0 0 16px rgb(255 42 109 / 0.15)', shadowHover: '0 0 0 1px #00f0ff, 0 0 22px rgb(0 240 255 / 0.35)',
    },
    shape: { radius: 0, notch: 12 },
    // Like a game menu: the selection goes hard yellow: yellow edge and glow, title bar yellow with black text.
    hover: { lift: 0, shadow: '0 0 0 1px #fcee0a, 0 0 24px rgb(252 238 10 / 0.35)', edge: '#fcee0a', title: { bg: '#fcee0a', text: '#0a0a12' } },
    type: { font: 'mono', weight: 700 },
    glass: { alpha: 0.82, blur: 8, saturate: 1.3, edge: 'rgb(0 240 255 / 0.45)' },
  },
];

builtIn.push({
  // Retro: a Windows 98 window (silver, bevelled 2 px edge, square corners, Tahoma) on the XP "Bliss" sky-and-hill;
  // hover is XP's: an orange edge and the blue title bar with white text.
  id: 'retro', name: 'Retro', author: 'Openmarks', version: 1,
  light: {
    bg: 'linear-gradient(180deg, #2f6fd0 0%, #5b9cf0 36%, #a9d3f8 54%, #79bb4f 55%, #3f8f2d 100%)',
    surface: '#c0c0c0', surface2: '#d4d0c8', plate: '#ffffff', hover: '#316ac5',
    text: '#000000', muted: '#303030', line: '#808080', ring: '#000080', danger: '#a00000',
    shadow: '1px 1px 0 #000000', shadowHover: '1px 1px 0 #000000',
  },
  shape: { radius: 0, border: { width: 2, style: 'outset' } },
  hover: { lift: 0, shadow: '0 0 0 2px #f8b636, 1px 1px 0 #000000', edge: '#e5961d', title: { bg: 'linear-gradient(180deg, #3d95ff, #0a5ad9)', text: '#ffffff' } },
  type: { font: 'retro', weight: 700 },
  glass: { alpha: 0.95, blur: 4, saturate: 1 },
});

export const themeById = (id: string, own: Theme[] = []) => builtIn.find((t) => t.id === id) ?? own.find((t) => t.id === id) ?? builtIn[0]!;

// ── Your own theme, as a CSS file ────────────────────────────────────────────
// The file sets custom properties: `:root { … }` is the light scheme, `:root.dark { … }` (or the same inside
// `@media (prefers-color-scheme: dark)`) the dark one; a file with only one of them makes a light- or dark-only theme.
// Properties the engine knows (below) become tokens, so Transparency, readability and the wallpaper accent keep
// working; anything else is set as written, and rules for other selectors (`.page .card { … }`) apply as they are.
// Anything left out comes from the Openmarks theme. "Download as CSS" writes any theme in this form, to start from.

const SCHEME: Record<string, keyof Scheme> = {
  '--bg': 'bg', '--surface': 'surface', '--surface-2': 'surface2', '--plate': 'plate', '--hover': 'hover', '--text': 'text',
  '--muted': 'muted', '--line': 'line', '--ring': 'ring', '--danger': 'danger', '--shadow': 'shadow', '--shadow-hover': 'shadowHover',
};
/** Theme-wide properties (shape, hover, type, glass, floating layers) and how each reads and writes its token.
 *  An optional one the theme doesn't have is written as `none`, so a downloaded theme loads back without it. */
const NONE = 'none';
const WIDE: Record<string, { get: (t: Theme) => string | number; set: (t: Theme, v: string) => void }> = {
  '--radius': { get: (t) => `${t.shape.radius}px`, set: (t, v) => (t.shape.radius = parseFloat(v) || 0) },
  '--notch': { get: (t) => `${t.shape.notch ?? 0}px`, set: (t, v) => (t.shape.notch = parseFloat(v) || 0) },
  '--border-width': { get: (t) => `${t.shape.border?.width ?? 1}px`, set: (t, v) => (t.shape.border = { style: t.shape.border?.style ?? 'solid', width: parseFloat(v) >= 2 ? 2 : 1 }) },
  '--border-style': { get: (t) => t.shape.border?.style ?? 'solid', set: (t, v) => (t.shape.border = { width: t.shape.border?.width ?? 1, style: v === 'outset' ? 'outset' : 'solid' }) },
  '--hover-lift': { get: (t) => `${t.hover.lift}px`, set: (t, v) => (t.hover.lift = Math.abs(parseFloat(v) || 0)) },
  '--hover-scale': { get: (t) => t.hover.scale ?? 1, set: (t, v) => (t.hover.scale = parseFloat(v) || 1) },
  '--hover-shadow': { get: (t) => t.hover.shadow, set: (t, v) => (t.hover.shadow = v) },
  '--hover-edge': { get: (t) => t.hover.edge ?? NONE, set: (t, v) => (t.hover.edge = v === NONE ? undefined : v) },
  '--hover-title-bg': { get: (t) => t.hover.title?.bg ?? NONE, set: (t, v) => (t.hover.title = v === NONE ? undefined : { text: t.hover.title?.text ?? 'inherit', bg: v }) },
  '--hover-title-text': { get: (t) => t.hover.title?.text ?? NONE, set: (t, v) => { if (v !== NONE) t.hover.title = { bg: t.hover.title?.bg ?? 'transparent', text: v }; } },
  '--font-family': { get: (t) => t.family ?? FONTS[t.type.font], set: (t, v) => (t.family = v) },
  '--tab-weight': { get: (t) => t.type.weight, set: (t, v) => (t.type.weight = ([500, 600, 700] as const).find((w) => w >= (parseFloat(v) || 600)) ?? 700) },
  '--glass-alpha': { get: (t) => t.glass.alpha, set: (t, v) => (t.glass.alpha = parseFloat(v) || 0.8) },
  '--glass-blur': { get: (t) => `${t.glass.blur}px`, set: (t, v) => (t.glass.blur = parseFloat(v) || 0) },
  '--glass-saturate': { get: (t) => t.glass.saturate, set: (t, v) => (t.glass.saturate = parseFloat(v) || 1) },
  '--glass-edge': { get: (t) => t.glass.edge ?? NONE, set: (t, v) => (t.glass.edge = v === NONE ? undefined : v) },
  '--glass-glow': { get: (t) => t.glass.glow ?? NONE, set: (t, v) => (t.glass.glow = v === NONE ? undefined : v) },
  // Frosted menus and dialogs: `none` on any of the three turns them off.
  '--menu-alpha': { get: (t) => t.float?.alpha ?? NONE, set: (t, v) => (t.float = v === NONE ? undefined : { blur: 0, scrim: 0, ...t.float, alpha: parseFloat(v) || 1 }) },
  '--menu-blur': { get: (t) => (t.float ? `${t.float.blur}px` : NONE), set: (t, v) => (t.float = v === NONE ? undefined : { alpha: 1, scrim: 0, ...t.float, blur: parseFloat(v) || 0 }) },
  '--dim-blur': { get: (t) => (t.float ? `${t.float.scrim}px` : NONE), set: (t, v) => (t.float = v === NONE ? undefined : { alpha: 1, blur: 0, ...t.float, scrim: parseFloat(v) || 0 }) },
};

const ROOT = /^(:root|html|\.page)$/;
const DARK = /^(:root|html|\.page)?\.dark$/;
/** A theme from a CSS file; null when the file sets nothing a theme could use. */
export function themeFromCss(css: string, id: string, fileName = 'My theme'): Theme | null {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css); // forgiving: rules it can't read are skipped; @import is ignored
  const light: Record<string, string> = {}, dark: Record<string, string> = {}, rest: string[] = [];
  const read = (r: CSSStyleRule, into: Record<string, string>) => {
    let other = false;
    for (const p of r.style) if (p.startsWith('--')) into[p] = r.style.getPropertyValue(p).trim(); else other = true;
    if (other) rest.push(r.cssText);
  };
  const walk = (rules: CSSRuleList, darkOnly: boolean) => {
    for (const r of rules) {
      const sels = r instanceof CSSStyleRule ? r.selectorText.split(',').map((s) => s.trim()) : [];
      if (r instanceof CSSStyleRule && sels.every((s) => ROOT.test(s))) read(r, darkOnly ? dark : light);
      else if (r instanceof CSSStyleRule && sels.every((s) => DARK.test(s))) read(r, dark);
      else if (r instanceof CSSMediaRule && /prefers-color-scheme:\s*dark/.test(r.conditionText)) walk(r.cssRules, true);
      else rest.push(r.cssText);
    }
  };
  walk(sheet.cssRules, false);
  const scheme = (vars: Record<string, string>) => Object.keys(vars).some((k) => k in SCHEME);
  const hasLight = scheme(light), hasDark = scheme(dark);
  if (!Object.keys(light).length && !Object.keys(dark).length && !rest.length) return null;

  // Starts from Openmarks; `:root` applies to both schemes and `.dark` on top of it, as the cascade would.
  const base = structuredClone(builtIn[0]!);
  const name = css.match(/\/\*[^]*?\bname\s*:\s*([^\n*]+)/i)?.[1]?.trim() || fileName.replace(/\.css$/i, '');
  const t: Theme = { ...base, id, name: name.slice(0, 40), author: 'You', vars: {}, css: rest.join('\n'), family: undefined };
  const fill = (s: Scheme, vars: Record<string, string>, own: Record<string, string>) => {
    for (const [k, v] of Object.entries(vars)) {
      if (k in SCHEME) s[SCHEME[k]!] = v;
      else if (k in WIDE) WIDE[k]!.set(t, v);
      else own[k] = v;
    }
    return s;
  };
  // Neither scheme given (only shape, hover or rules): both of Openmarks' schemes. Otherwise the ones the file has.
  const both = !hasLight && !hasDark;
  t.light = both || hasLight ? fill(base.light!, light, (t.vars!.light = {})) : undefined;
  t.dark = both || hasDark ? fill(fill(base.dark!, light, (t.vars!.dark = {})), dark, t.vars!.dark) : undefined;
  return t;
}

/** Any theme as a CSS file in the form above, ready to edit and load back. */
export function themeToCss(t: Theme): string {
  const block = (sel: string, lines: string[]) => (lines.length ? `${sel} {\n${lines.map((l) => `  ${l}`).join('\n')}\n}\n` : '');
  const scheme = (s: Scheme | undefined, own: Record<string, string> = {}) =>
    s ? [...Object.entries(SCHEME).map(([k, f]) => `${k}: ${s[f]};`), ...Object.entries(own).map(([k, v]) => `${k}: ${v};`)] : [];
  const wide = Object.entries(WIDE).map(([k, w]) => `${k}: ${w.get(t)};`);

  // A dark-only theme keeps only theme-wide properties in :root, so loading it back gives a dark-only theme again.
  return [
    `/* Openmarks theme\n   name: ${t.name}\n\n` +
    `   :root sets the light scheme, :root.dark the dark one; keep only one of them for a light- or dark-only theme.\n` +
    `   Anything you leave out comes from the Openmarks theme. Any other rules apply as written; put .page in front\n` +
    `   of a selector (".page .card") so it wins over the built-in style. */\n`,
    block(':root', [...wide, ...scheme(t.light, t.vars?.light)]),
    block(':root.dark', scheme(t.dark, t.vars?.dark)),
    t.css ?? '',
  ].filter(Boolean).join('\n');
}

// ── Accent from the wallpaper ────────────────────────────────────────────────
// The Openmarks theme has no colour of its own: its accent (focus rings, selections, switches, buttons) is the
// wallpaper's most prominent colour, adjusted until it reads on the theme's surfaces (≥ 3:1, WCAG non-text contrast).

function hsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

/** Most prominent saturated colour in RGBA pixels (coarse buckets, most common wins); null when the picture is grey. */
export function prominent(d: Uint8ClampedArray): [number, number, number] | null {
  const buckets = new Map<number, [number, number, number, number]>();
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]!, g = d[i + 1]!, b = d[i + 2]!;
    const [, s, l] = hsl(r, g, b);
    if (s < 0.28 || l < 0.12 || l > 0.92) continue; // skip greys, near-black, near-white
    const k = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const e = buckets.get(k) ?? [0, 0, 0, 0];
    const w = 1 + s * 2; // favour vivid colours a little
    e[0] += r * w; e[1] += g * w; e[2] += b * w; e[3] += w;
    buckets.set(k, e);
  }
  const top = [...buckets.values()].sort((a, b) => b[3] - a[3])[0];
  if (!top || top[3] < d.length / 4 / 40) return null; // under ~2.5 % of the picture: not prominent
  const n = top[3];
  return [top[0] / n, top[1] / n, top[2] / n].map((v) => Math.round(v)) as [number, number, number];
}

/** A usable accent from a colour: same hue, enough saturation, lightness moved until it contrasts with the surface. */
export function accentFrom(rgb: [number, number, number], surface: string, dark: boolean): string {
  const [h, s0] = hsl(...rgb);
  const s = Math.max(0.5, Math.min(0.9, s0));
  for (let l = dark ? 0.62 : 0.45; dark ? l <= 0.85 : l >= 0.2; l += dark ? 0.03 : -0.03) {
    const c = `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
    if (contrast(c, surface) >= 3) return c;
  }
  return dark ? '#7aa2ff' : '#3b6ef5';
}
/** Text that reads on the accent (buttons). */
export const onAccent = (accent: string) => (contrast('#ffffff', accent) >= contrast('#111111', accent) ? '#ffffff' : '#111111');
