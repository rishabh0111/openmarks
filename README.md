<p align="center"><img src="apps/extension/public/icon/logo.svg" alt="Openmarks logo" width="96" height="96"></p>

# Openmarks

Website: [rishabh0111.github.io/openmarks](https://rishabh0111.github.io/openmarks/)

A speed dial for the new tab page that keeps your links in your browser's bookmarks. Pick a bookmarks folder and
its sites and subfolders become tiles, with site pictures, themes, a daily wallpaper (Bing, Wikimedia or Unsplash),
search and keyboard and controller shortcuts.

## Build

Needs Node 22 and pnpm.

```sh
pnpm install && pnpm --filter @openmarks/extension build -b firefox
```

The Firefox extension is written to `apps/extension/.output/firefox-mv3`. Leave out `-b firefox` for the Chromium
build (`.output/chrome-mv3`).

## License

GPL-3.0-or-later (see `LICENSE`). `packages/*` are MIT.
