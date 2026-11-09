// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { randomUUID } from 'node:crypto';
import { clingoLogicBackend } from '@cyberismo/data-handler';

import { describeLogicBackendContract } from '../src/index.js';

describeLogicBackendContract('clingo', () =>
  clingoLogicBackend({ id: randomUUID(), label: 'contract' }),
);
