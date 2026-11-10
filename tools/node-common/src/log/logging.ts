// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import pino from 'pino';
import type {
  ChildLoggerOptions,
  DestinationStream,
  Level as LogLevel,
  Logger,
} from 'pino';

export type { Logger, LogLevel };

export type LogDestination =
  | { file: string; level?: LogLevel }
  | { stream: 'stdout' | 'stderr' | DestinationStream; level?: LogLevel };

interface Closable {
  end(): void;
}

let state: { root: Logger; generation: number } = {
  root: pino({ level: 'silent' }),
  generation: 0,
};
let openFiles: Closable[] = [];

function openFile(file: string): DestinationStream & Closable {
  const dir = dirname(file);
  mkdirSync(dir, { recursive: true });
  const ignore = join(dir, '.gitignore');
  if (!existsSync(ignore)) writeFileSync(ignore, '*\n');
  const destination = pino.destination({
    dest: file,
    sync: true,
    append: true,
  });
  // Logging must never take the process down.
  destination.on('error', () => {});
  return destination;
}

/** Replaces the process's log destinations. `level` defaults to 'trace'. */
export function configureLogging(destinations: LogDestination[]): void {
  for (const file of openFiles) file.end();
  openFiles = [];

  const streams: { level: LogLevel; stream: DestinationStream }[] = [];
  for (const destination of destinations) {
    const level = destination.level ?? 'trace';
    try {
      if ('file' in destination) {
        const stream = openFile(destination.file);
        openFiles.push(stream);
        streams.push({ level, stream });
      } else if (destination.stream === 'stdout') {
        streams.push({
          level,
          stream: pino.destination({ fd: 1, sync: true }),
        });
      } else if (destination.stream === 'stderr') {
        streams.push({
          level,
          stream: pino.destination({ fd: 2, sync: true }),
        });
      } else {
        streams.push({ level, stream: destination.stream });
      }
    } catch {
      // An unusable destination is dropped; the others still log.
    }
  }

  const root =
    streams.length === 0
      ? pino({ level: 'silent' })
      : pino(
          {
            level: streams.reduce(
              (lowest, s) =>
                pino.levels.values[s.level] < pino.levels.values[lowest]
                  ? s.level
                  : lowest,
              streams[0].level,
            ),
          },
          pino.multistream(streams),
        );
  state = { root, generation: state.generation + 1 };
}

/** A handle that resolves the current destinations each time it logs. */
export function getLogger(
  bindings?: Record<string, unknown>,
  options?: ChildLoggerOptions,
): Logger {
  let cached: { generation: number; logger: Logger } | undefined;
  const resolve = (): Logger => {
    if (!bindings) return state.root;
    if (cached?.generation !== state.generation) {
      cached = {
        generation: state.generation,
        logger: state.root.child(bindings, options),
      };
    }
    return cached.logger;
  };
  return new Proxy({} as Logger, {
    get(_, property) {
      const logger = resolve();
      const value = Reflect.get(logger, property, logger);
      return typeof value === 'function' ? value.bind(logger) : value;
    },
    set(_, property, value) {
      return Reflect.set(resolve(), property, value);
    },
  });
}
