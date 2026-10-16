// SPDX-License-Identifier: GPL-3.0-or-later
// Run by packages/core's `test` script with `--root ../..`; vitest is not a root dependency,
// so this file exports a plain object instead of importing `defineConfig`.
export default {
  test: {
    projects: ['packages/core', 'modules/dial'],
  },
};
