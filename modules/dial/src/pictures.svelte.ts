// SPDX-License-Identifier: GPL-3.0-or-later
// Per-tile picture choice made in the Edit dialog, kept in localStorage.
import { putNormal } from './private';

export type Picture = {
  /** auto = follow the Pictures setting; image = a cover the page offers; icon = one of its logos; shot = a screenshot
   *  of the page; url = pasted image address; upload = a file. */
  source: 'auto' | 'image' | 'icon' | 'shot' | 'url' | 'upload';
  src?: string; // the chosen candidate / pasted URL / uploaded data URL
  plate: string; // 'auto' | CSS colour behind logos
  zoom: number; // kept for older saved pictures
  x: number;
  y: number;
};

export const defaultPicture: Picture = { source: 'auto', plate: 'auto', zoom: 1, x: 0, y: 0 };
const KEY = 'proto-picture2:';

function read(): Record<string, Picture> {
  const out: Record<string, Picture> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (k.startsWith(KEY)) out[k.slice(KEY.length)] = JSON.parse(localStorage.getItem(k)!) as Picture;
  }
  return out;
}

export const pictures = $state<Record<string, Picture>>(read());

export function setPicture(id: string, p: Picture) {
  pictures[id] = p;
  try {
    localStorage.setItem(KEY + id, JSON.stringify(p));
    putNormal(KEY + id, JSON.stringify(p));
  } catch {
    /* storage full: keep for this session */
  }
}

/** Keep a tile's picture when its bookmark is re-created (undo after delete). */
export function copyPicture(fromId: string, toId: string) {
  const p = pictures[fromId];
  if (p) setPicture(toId, { ...p });
}
