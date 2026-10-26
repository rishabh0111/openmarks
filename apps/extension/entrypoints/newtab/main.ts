// SPDX-License-Identifier: GPL-3.0-or-later
import { seedPrivate } from '../../../../modules/dial/src/private';

// In a private window the saved settings are copied in first: the dial reads them as soon as it loads.
void seedPrivate().then(async () => {
  const [{ mountModules }, { dial }, { apiFor }] = await Promise.all([import('@openmarks/core'), import('@openmarks/module-dial'), import('./api')]);
  mountModules(document.body, [dial], apiFor);
});
