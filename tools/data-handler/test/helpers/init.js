// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { resolve } from 'path';
process.env.TS_NODE_PROJECT = resolve('test/tsconfig.json');
process.env.NODE_ENV = 'development';
