// SPDX-License-Identifier: GPL-3.0-or-later
// Controller support: the Gamepad API turned into the same actions as the keyboard. Polls only while a
// controller is connected; held directions repeat like a key (350 ms, then every 110 ms).
export type PadAction = 'up' | 'down' | 'left' | 'right' | 'open' | 'back' | 'menu' | 'search' | 'prevFolder' | 'nextFolder' | 'settings';

const BUTTONS: Record<number, PadAction> = { 0: 'open', 1: 'back', 2: 'menu', 3: 'search', 4: 'prevFolder', 5: 'nextFolder', 9: 'settings', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };

export function watchGamepads(on: (a: PadAction) => void): () => void {
  let raf = 0;
  const held = new Map<PadAction, number>(); // action → next repeat time
  const frame = (t: number) => {
    const pad = [...navigator.getGamepads()].find((g) => g?.connected);
    if (!pad) { raf = 0; return; }
    const now = new Set<PadAction>();
    pad.buttons.forEach((b, i) => { const a = BUTTONS[i]; if (a && b.pressed) now.add(a); });
    const [x = 0, y = 0] = pad.axes;
    if (x < -0.5) now.add('left'); if (x > 0.5) now.add('right'); if (y < -0.5) now.add('up'); if (y > 0.5) now.add('down');
    for (const a of now) {
      const next = held.get(a);
      if (next === undefined) { on(a); held.set(a, t + 350); }
      else if (t >= next && ['up', 'down', 'left', 'right'].includes(a)) { on(a); held.set(a, t + 110); }
    }
    for (const a of [...held.keys()]) if (!now.has(a)) held.delete(a);
    raf = requestAnimationFrame(frame);
  };
  const start = () => { if (!raf) raf = requestAnimationFrame(frame); };
  addEventListener('gamepadconnected', start);
  if ([...navigator.getGamepads()].some((g) => g?.connected)) start();
  return () => { removeEventListener('gamepadconnected', start); cancelAnimationFrame(raf); };
}
