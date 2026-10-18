<p align="center"><img src="apps/extension/public/icon/logo.svg" alt="Openmarks logo" width="96" height="96"></p>

# Openmarks

Openmarks is available for **Firefox** and **Chrome**.

- Firefox: [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/openmarks/) (coming soon)
- Chrome: [Chrome Web Store](https://chromewebstore.google.com/) (coming soon)
- Website: [rishabh0111.github.io/openmarks](https://rishabh0111.github.io/openmarks/)

Openmarks is a free, open-source speed dial for the new tab page. Pick a bookmarks folder and its sites and
subfolders become tiles and tabs, so your links stay in your browser's bookmarks and sync wherever they already do.
No account, no ads, no tracking.

## Features

- Tiles built from an ordinary bookmarks folder, with subfolders as tabs
- Site pictures for tiles, themes, and light and dark modes
- A daily wallpaper from Bing, Wikimedia or Unsplash, or your own picture or colour
- Search, plus paste a link anywhere to add a tile
- Keyboard shortcuts (arrow keys or Vim keys) and game controller support
- Fits every screen, from phones and tablets to ultrawide monitors, with pictures kept sharp on HiDPI displays
- Fast and minimal: about 70 KB, opens instantly from a local cache, no ads, no tracking, no account

## Build and development

Needs Node 22 and pnpm.

```sh
pnpm install && pnpm --filter @openmarks/extension build -b firefox
```

The Firefox extension is written to `apps/extension/.output/firefox-mv3`. Leave out `-b firefox` for the Chromium
build (`.output/chrome-mv3`).

From the repo root, `pnpm test`, `pnpm lint` and `pnpm typecheck` run the checks across all packages.

## License

GPL-3.0-or-later (see `LICENSE`). `packages/*` are MIT.
