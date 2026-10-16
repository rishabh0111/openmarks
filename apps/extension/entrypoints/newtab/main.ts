// SPDX-License-Identifier: GPL-3.0-or-later
import { mountModules } from '@openmarks/core';
import { dial } from '@openmarks/module-dial';
import { apiFor } from './api';

mountModules(document.body, [dial], apiFor);
