// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { randomUUID } from 'node:crypto';
import { clingoLogicBackend } from '../../src/infra/logic/clingo-backend.js';

import { describeLogicBackendContract } from './contract.js';

// Clingo keeps what it is given; refusing would solve the whole project on
// every write.
describeLogicBackendContract(
  'clingo',
  () => clingoLogicBackend({ id: randomUUID(), label: 'contract' }),
  { refusesNonTotal: false },
);
