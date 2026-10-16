// SPDX-License-Identifier: GPL-3.0-or-later
// Paints the new tab's last background before the app loads, so opening a tab never flashes.
// Runs synchronously in <head>; reads only what the page itself saved (see modules/dial/src/wallpaper.ts).
try {
  var b = JSON.parse(localStorage.getItem('proto-boot') || 'null');
  if (b) {
    var s = document.documentElement.style;
    s.colorScheme = b.dark ? 'dark' : 'light';
    var snap = b.wall ? JSON.parse(localStorage.getItem('proto-wall-snap') || 'null') : null;
    s.background = snap ? 'center / cover no-repeat url("' + snap.data + '"), ' + b.bg : b.bg;
    s.minHeight = '100%';
  }
} catch (e) {}
