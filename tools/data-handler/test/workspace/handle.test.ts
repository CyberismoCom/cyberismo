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

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { Checkout } from '../../src/containers/project.js';
import { Workspace } from '../../src/workspace/workspace.js';
import { buildProject, type BuiltProject } from '../helpers/project-builder.js';

const ann = {
  actor: { kind: 'user', id: 'ann', name: 'Ann' },
  identity: { name: 'Ann', email: 'ann@example.com' },
} as const;
const bob = {
  actor: { kind: 'user', id: 'bob', name: 'Bob' },
  identity: { name: 'Bob', email: 'bob@example.com' },
} as const;

let project: BuiltProject;
let checkout: Checkout;

beforeEach(async () => {
  project = await buildProject({ git: true, cards: [{ title: 'Alpha' }] });
  checkout = await Checkout.open(project.path, { autocommit: true });
});

afterEach(async () => {
  checkout.dispose();
  await project.cleanup();
});

it('shares the checkout and lock between handles; only the actor differs', () => {
  const a = Workspace.over(checkout, ann.actor, ann.identity);
  const b = Workspace.over(checkout, bob.actor, bob.identity);

  expect(a.checkout).toBe(b.checkout);
  expect(a.checkout.lock).toBe(b.checkout.lock);
  expect([a.actor, b.actor]).toEqual([ann.actor, bob.actor]);

  // Façades are the handle's own: one per handle, with its actor.
  expect(a.cards).toBe(a.cards);
  expect(a.cards).not.toBe(b.cards);
  expect([a.cards.actor, b.cards.actor]).toEqual([ann.actor, bob.actor]);
});

it('commits a façade write as the actor of its handle', async () => {
  const built = await buildProject({
    git: true,
    cards: [{ title: 'Parent' }, { title: 'Child' }],
  });
  const other = await Checkout.open(built.path, { autocommit: true });
  try {
    const [parent, child] = built.keys;
    await Workspace.over(other, bob.actor, bob.identity).cards.move(
      child,
      parent,
    );
    const { stdout } = await promisify(execFile)(
      'git',
      ['log', '-1', '--format=%s|%an <%ae>'],
      { cwd: built.path },
    );
    expect(stdout.trim()).toBe(
      `Move card ${child} to ${parent}|Bob <bob@example.com>`,
    );
  } finally {
    other.dispose();
    await built.cleanup();
  }
});

it('commits each write as the actor of the handle it went through', async () => {
  const [key] = project.keys;
  await Workspace.over(checkout, ann.actor, ann.identity).cards.addLabel(
    key,
    'first',
  );
  await Workspace.over(checkout, bob.actor, bob.identity).cards.addLabel(
    key,
    'second',
  );

  const { stdout } = await promisify(execFile)(
    'git',
    ['log', '-2', '--format=%s|%an <%ae>'],
    { cwd: project.path },
  );
  expect(stdout.trim().split('\n')).toEqual([
    `Add label second to ${key}|Bob <bob@example.com>`,
    `Add label first to ${key}|Ann <ann@example.com>`,
  ]);
});
