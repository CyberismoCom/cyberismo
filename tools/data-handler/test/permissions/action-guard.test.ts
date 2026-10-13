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

import { afterEach, describe, expect, it } from 'vitest';

import { PermissionDeniedError } from '../../src/exceptions/index.js';
import {
  ActionGuard,
  type Action,
} from '../../src/permissions/action-guard.js';
import type { Workspace } from '../../src/workspace/workspace.js';
import { openTestWorkspace } from '../helpers/open-test-workspace.js';
import { buildProject, type BuiltProject } from '../helpers/project-builder.js';

// Denies every guarded action on the card titled "Locked", with one
// reason each, except that only "To Closed" is a denied transition.
const LOCKED = (title: string) => `
transitionDenied(C, "To Closed", "no closing") :- field(C, "title", "${title}").
movingCardDenied(C, "no moving") :- field(C, "title", "${title}").
deletingCardDenied(C, "no deleting") :- field(C, "title", "${title}").
editingFieldDenied(C, "title", "no title edit") :- field(C, "title", "${title}").
editingContentDenied(C, "no content edit") :- field(C, "title", "${title}").
`;

// Denies move, delete and the edits on every card, so a write that
// succeeds did so because the guard was skipped.
const DENY_ALL = `
movingCardDenied(C, "no moving") :- card(C).
deletingCardDenied(C, "no deleting") :- card(C).
editingFieldDenied(C, "title", "no title edit") :- card(C).
editingContentDenied(C, "no content edit") :- card(C).
`;

interface Fixture {
  ws: Workspace;
  guard: ActionGuard;
  locked: string;
  child: string;
  free: string;
  other: string;
  template: string;
}

const built: BuiltProject[] = [];
const open: Workspace[] = [];

afterEach(async () => {
  for (const ws of open.splice(0)) ws.checkout.dispose();
  await Promise.all(built.splice(0).map((project) => project.cleanup()));
});

async function fixture(calculation: string): Promise<Fixture> {
  const project = await buildProject({
    cards: [
      { title: 'Locked', content: 'original', children: [{ title: 'Child' }] },
      { title: 'Free', content: 'original' },
      { title: 'Other' },
    ],
    templates: [
      { name: 'tpl', cards: [{ title: 'Tpl', content: 'original' }] },
    ],
    calculations: { guard: calculation },
  });
  built.push(project);
  const ws = await openTestWorkspace(project.path);
  open.push(ws);
  const [locked, child, free, other] = project.keys;
  return {
    ws,
    guard: new ActionGuard(ws.checkout.calculationEngine),
    locked,
    child,
    free,
    other,
    template: project.templateKeys['test/templates/tpl'][0],
  };
}

async function denial(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(PermissionDeniedError);
  return (error as PermissionDeniedError).reasons;
}

describe('ActionGuard.checkPermission', () => {
  it.each<[Action, string | undefined, string]>([
    ['transition', 'To Closed', 'no closing'],
    ['move', undefined, 'no moving'],
    ['delete', undefined, 'no deleting'],
    ['editField', 'title', 'no title edit'],
    ['editContent', undefined, 'no content edit'],
  ])('denies %s with the calculation reason', async (action, param, reason) => {
    const { guard, locked } = await fixture(LOCKED('Locked'));
    expect(await denial(guard.checkPermission(action, locked, param))).toEqual([
      reason,
    ]);
  });

  it.each<[Action, string | undefined]>([
    ['transition', 'To Closed'],
    ['move', undefined],
    ['delete', undefined],
    ['editField', 'title'],
    ['editContent', undefined],
  ])('allows %s on a card without denials', async (action, param) => {
    const { guard, free } = await fixture(LOCKED('Locked'));
    await expect(guard.checkPermission(action, free, param)).resolves.toBe(
      undefined,
    );
  });

  it.each<[Action, string]>([
    ['transition', 'To In Progress'],
    ['editField', 'labels'],
  ])('%s denials only apply to the named %s', async (action, param) => {
    const { guard, locked } = await fixture(LOCKED('Locked'));
    await expect(guard.checkPermission(action, locked, param)).resolves.toBe(
      undefined,
    );
  });

  it('reports every reason when several rules deny the same action', async () => {
    const { guard, locked } = await fixture(
      `deletingCardDenied(C, "first") :- field(C, "title", "Locked").
       deletingCardDenied(C, "second") :- field(C, "title", "Locked").`,
    );
    const reasons = await denial(guard.checkPermission('delete', locked));
    expect([...reasons].sort()).toEqual(['first', 'second']);
  });
});

describe('guarded entry points', () => {
  it('transition is denied and leaves the state alone', async () => {
    const { ws, locked } = await fixture(LOCKED('Locked'));
    const before = ws.checkout.findCard(locked).metadata?.workflowState;
    expect(
      await denial(ws.transitionCmd.cardTransition(locked, 'To Closed')),
    ).toEqual(['no closing']);
    expect(ws.checkout.findCard(locked).metadata?.workflowState).toBe(before);
  });

  it('transition runs when the named transition is not denied', async () => {
    const { ws, locked } = await fixture(LOCKED('Locked'));
    await ws.transitionCmd.cardTransition(locked, 'To In Progress');
    expect(ws.checkout.findCard(locked).metadata?.workflowState).toBe(
      'In Progress',
    );
  });

  it('move is denied and leaves the card in place', async () => {
    const { ws, locked, other } = await fixture(LOCKED('Locked'));
    expect(await denial(ws.cards.move(locked, other))).toEqual(['no moving']);
    expect(ws.checkout.findCard(locked).parent).toBe('root');
  });

  it('move runs for a card without denials', async () => {
    const { ws, free, other } = await fixture(LOCKED('Locked'));
    await ws.cards.move(free, other);
    expect(ws.checkout.findCard(free).parent).toBe(other);
  });

  it('delete is denied and keeps the card', async () => {
    const { ws, locked } = await fixture(LOCKED('Locked'));
    expect(await denial(ws.removeCmd.remove('card', locked))).toEqual([
      'no deleting',
    ]);
    expect(ws.checkout.findCard(locked).key).toBe(locked);
  });

  it('delete runs for a card without denials', async () => {
    const { ws, free } = await fixture(LOCKED('Locked'));
    await ws.removeCmd.remove('card', free);
    expect(() => ws.checkout.findCard(free)).toThrow();
  });

  it('editField is denied and keeps the title', async () => {
    const { ws, locked } = await fixture(LOCKED('Locked'));
    expect(
      await denial(ws.editCmd.editCardMetadata(locked, 'title', 'Renamed')),
    ).toEqual(['no title edit']);
    expect(ws.checkout.findCard(locked).metadata?.title).toBe('Locked');
  });

  it('editField runs for a field that is not denied', async () => {
    const { ws, locked } = await fixture(LOCKED('Locked'));
    await ws.editCmd.editCardMetadata(locked, 'labels', ['kept']);
    expect(ws.checkout.findCard(locked).metadata?.labels).toEqual(['kept']);
  });

  it('editContent is denied and keeps the content', async () => {
    const { ws, locked } = await fixture(LOCKED('Locked'));
    expect(await denial(ws.editCmd.editCardContent(locked, 'changed'))).toEqual(
      ['no content edit'],
    );
    expect(ws.checkout.findCard(locked).content).toBe('original');
  });

  it('editContent runs for a card without denials', async () => {
    const { ws, free } = await fixture(LOCKED('Locked'));
    await ws.editCmd.editCardContent(free, 'changed');
    expect(ws.checkout.findCard(free).content).toBe('changed');
  });
});

describe('guard skip paths', () => {
  it('moving a card to its current parent returns before the guard', async () => {
    const { ws, locked, child } = await fixture(DENY_ALL);
    await ws.cards.move(child, locked);
    expect(ws.checkout.findCard(child).parent).toBe(locked);
    // The same call to a different parent is guarded.
    expect(await denial(ws.cards.move(child, 'root'))).toEqual(['no moving']);
  });

  it('template cards skip the editContent guard', async () => {
    const { ws, template, free } = await fixture(DENY_ALL);
    await ws.editCmd.editCardContent(template, 'changed');
    expect(ws.checkout.findCard(template).content).toBe('changed');
    await denial(ws.editCmd.editCardContent(free, 'changed'));
  });

  it('template cards skip the editField guard', async () => {
    const { ws, template, free } = await fixture(DENY_ALL);
    await ws.editCmd.editCardMetadata(template, 'title', 'Renamed');
    expect(ws.checkout.findCard(template).metadata?.title).toBe('Renamed');
    await denial(ws.editCmd.editCardMetadata(free, 'title', 'Renamed'));
  });

  it('template cards skip the delete guard', async () => {
    const { ws, template, free } = await fixture(DENY_ALL);
    await ws.removeCmd.remove('card', template);
    expect(() => ws.checkout.findCard(template)).toThrow();
    await denial(ws.removeCmd.remove('card', free));
  });
});
