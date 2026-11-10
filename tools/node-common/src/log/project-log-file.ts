// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { join } from 'node:path';

/** `<dir>/.logs/cyberismo-YYYY-MM-DD.log`, local date. Does not touch disk. */
export function projectLogFile(dir: string, now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return join(dir, '.logs', `cyberismo-${date}.log`);
}
