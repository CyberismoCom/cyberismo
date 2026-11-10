// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import {
  configureLogging,
  projectLogFile,
  type LogDestination,
  type LogLevel,
} from '@cyberismo/node-common/log';

/**
 * Chooses the process's log destinations: a file under `dir` at trace when
 * `dir` is given; stderr at `level` when given. Never stdout.
 */
export function configureCliLogging(dir?: string, level?: LogLevel): void {
  const destinations: LogDestination[] = [];
  if (dir !== undefined) {
    destinations.push({ file: projectLogFile(dir), level: 'trace' });
  }
  if (level !== undefined) {
    destinations.push({ stream: 'stderr', level });
  }
  configureLogging(destinations);
}
