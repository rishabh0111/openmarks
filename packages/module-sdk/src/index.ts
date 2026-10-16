// SPDX-License-Identifier: MIT
// The Module contract: everything a Module may know about the core (ADR 0002).

export type Capability =
  | 'bookmarks.read'
  | 'bookmarks.write'
  | 'storage'
  | 'prefs'
  | 'theme'
  | 'events'
  | 'net.fetch'
  | 'icons';

export interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  capabilities: Capability[];
  /** Provisional until settings exist. */
  settingsSchema?: unknown;
}

export type DialItem =
  | { kind: 'link'; id: string; title: string; url: string }
  | { kind: 'folder'; id: string; title: string; items: DialItem[] };

export type DialFolder = { id: string; title: string; items: DialItem[] };

export type DialErrorCode = 'ROOT_NOT_FOUND' | 'UNAVAILABLE';

export class DialLoadError extends Error {
  readonly code: DialErrorCode;

  constructor(code: DialErrorCode, options?: { cause?: unknown }) {
    super(`Dial could not load: ${code}`, options);
    this.name = 'DialLoadError';
    this.code = code;
  }
}

export interface ModuleApi {
  bookmarks: { dial(): Promise<DialFolder> };
}

export interface ModuleDefinition {
  manifest: ModuleManifest;
  /** Renders the Module into `el`; may return a function that removes it. */
  mount(el: HTMLElement, api: ModuleApi): void | (() => void);
}

export function defineModule(manifest: ModuleManifest, mount: ModuleDefinition['mount']): ModuleDefinition {
  return { manifest, mount };
}
