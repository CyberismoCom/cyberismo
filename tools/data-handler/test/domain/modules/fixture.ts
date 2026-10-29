// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach } from 'vitest';

import {
  buildProject,
  type ProjectSpec,
} from '../../helpers/project-builder.js';

export { expectRefused, projects, snapshot } from '../cards/fixture.js';

// Call once per file; every source it builds is removed after each test.
export function sources() {
  const cleanups: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup();
  });
  // A project to install as a module: its path is the module's file source.
  return async (spec: ProjectSpec) => {
    const source = await buildProject(spec);
    cleanups.push(source.cleanup);
    return source.path;
  };
}

interface Config {
  name?: string;
  version?: string;
  cardKeyPrefix?: string;
  schemaVersion?: number;
  modules: {
    name: string;
    location: string;
    version?: string;
    private?: boolean;
  }[];
}

const configOf = (path: string) =>
  join(path, '.cards', 'local', 'cardsConfig.json');

export const readConfig = (path: string) =>
  JSON.parse(readFileSync(configOf(path), 'utf-8')) as Config;

// Rewrites a project's cardsConfig.json; used on a module source to change it
// between installs.
export function editConfig(path: string, edit: (config: Config) => void) {
  const config = readConfig(path);
  edit(config);
  writeFileSync(configOf(path), JSON.stringify(config, null, 4));
}

// The modules the project declares, by name.
export const declared = (path: string): string[] =>
  readConfig(path).modules.map((module) => module.name);

export const isInstalled = (path: string, prefix: string) =>
  existsSync(join(path, '.cards', 'modules', prefix));

// `file:` location of a module source, as a declaration or a dependency holds it.
export const fileLocation = (path: string) => `file:${path}`;
