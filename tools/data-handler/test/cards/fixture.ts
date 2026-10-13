/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { afterEach, expect } from 'vitest';

import type { Card } from '@cyberismo/model';
import type { Workspace } from '../../src/workspace/workspace.js';
import type { WorkspaceOptions } from '../../src/workspace/workspace.js';
import { sortItems } from '../../src/utils/lexorank.js';
import {
  buildProject,
  type CardSpec,
  type ProjectSpec,
} from '../helpers/project-builder.js';
import { openTestWorkspace } from '../helpers/open-test-workspace.js';

// Call once per file; every project it opens is disposed after each test.
export function projects() {
  const cleanups: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup();
  });
  return async (spec: ProjectSpec = {}, options: WorkspaceOptions = {}) => {
    const project = await buildProject(spec);
    const ws = await openTestWorkspace(project.path, options);
    cleanups.push(async () => {
      ws.checkout.dispose();
      await project.cleanup();
    });
    return { ws, cards: ws.cards, ...project };
  };
}

// Every project file by relative path, minus git and generated folders.
export function snapshot(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(dir, {
    recursive: true,
    withFileTypes: true,
  })) {
    const name = relative(dir, join(entry.parentPath, entry.name));
    if (
      entry.isFile() &&
      !/^(\.git|\.calc|\.logs|\.temp)$/.test(name.split(sep)[0])
    ) {
      files[name] = readFileSync(join(dir, name), 'utf-8');
    }
  }
  return files;
}

// The operation is refused with `error` and leaves every file as it was.
export async function expectRefused(
  dir: string,
  operation: () => Promise<unknown>,
  error: RegExp | (new (...args: never[]) => Error),
) {
  const before = snapshot(dir);
  await expect(operation()).rejects.toThrow(error);
  expect(snapshot(dir)).toEqual(before);
}

export const metadataOf = async (ws: Workspace, key: string) =>
  (await ws.cards.details(key)).metadata!;

const byRank = (cards: Card[]) =>
  sortItems(cards, (card) => card.metadata!.rank).map((card) => card.key);

// Tree reads are unordered; these give the keys in rank order.
export const childKeys = async (ws: Workspace, key: string) =>
  byRank(
    await Promise.all(
      (await ws.cards.details(key)).children.map((child) =>
        ws.cards.details(child),
      ),
    ),
  );

export const rootKeys = async (ws: Workspace) => byRank(await ws.cards.roots());

// Open → Review → Done; Start only from Open, Close from anywhere.
export const flow = {
  name: 'flow',
  states: [
    { name: 'Open', category: 'initial' as const },
    { name: 'Review', category: 'active' as const },
    { name: 'Done', category: 'closed' as const },
  ],
  transitions: [
    { name: 'Create', fromState: [], toState: 'Open' },
    { name: 'Start', fromState: ['Open'], toState: 'Review' },
    { name: 'Finish', fromState: ['Review'], toState: 'Done' },
    { name: 'Close', fromState: ['*'], toState: 'Done' },
  ],
};

// An installed module with one template `mod/templates/mt`, read-only to the project.
export const readOnlyModule = (cards: CardSpec[] = [{}]) => ({
  prefix: 'mod',
  workflows: [{ name: 'flow' }],
  cardTypes: [{ name: 'page' }],
  templates: [{ name: 'mt', cards }],
});
