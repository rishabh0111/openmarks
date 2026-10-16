// SPDX-License-Identifier: GPL-3.0-or-later
import { mount, unmount } from 'svelte';
import { defineModule } from '@openmarks/module-sdk';
import Dial from './Dial.svelte';

export const dial = defineModule(
  { id: 'dial', name: 'Dial', version: '0.1.0', capabilities: ['bookmarks.read'] },
  (el, api) => {
    const app = mount(Dial, { target: el, props: { api } });
    return () => void unmount(app);
  },
);
