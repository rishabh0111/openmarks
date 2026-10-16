// SPDX-License-Identifier: MIT
import type { ModuleApi, ModuleDefinition, ModuleManifest } from '@openmarks/module-sdk';

/** Mounts each Module into its own element under `root`, in order, with the API `apiFor` grants it. */
export function mountModules(
  root: HTMLElement,
  modules: ModuleDefinition[],
  apiFor: (m: ModuleManifest) => ModuleApi,
): void {
  for (const module of modules) {
    const el = document.createElement('div');
    root.append(el);
    module.mount(el, apiFor(module.manifest));
  }
}
