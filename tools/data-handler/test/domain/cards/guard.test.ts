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

import { PermissionDeniedError } from '../../../src/shared/exceptions/index.js';
import { assertAllowed, type Action } from '../../../src/domain/cards/guard.js';
import type { Workspace } from '../../../src/api/workspace/workspace.js';
import { openTestWorkspace } from '../../helpers/open-test-workspace.js';
import {
  buildProject,
  type BuiltProject,
} from '../../helpers/project-builder.js';
import { findCard } from '../../../src/domain/cards/read.js';
import { checkoutOf } from '../../../src/state/checkout/internal.js';
import type { Checkout } from '../../../src/state/checkout/checkout.js';

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
  checkout: Checkout;
  locked: string;
  child: string;
  free: string;
  other: string;
  template: string;
}

const built: BuiltProject[] = [];

afterEach(async () => {
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
  const [locked, child, free, other] = project.keys;
  return {
    ws,
    checkout: checkoutOf(ws),
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

describe('assertAllowed', () => {
  it.each<[Action, string | undefined, string]>([
    ['transition', 'To Closed', 'no closing'],
    ['move', undefined, 'no moving'],
    ['delete', undefined, 'no deleting'],
    ['editField', 'title', 'no title edit'],
    ['editContent', undefined, 'no content edit'],
  ])('denies %s with the calculation reason', async (action, param, reason) => {
    const { checkout, locked } = await fixture(LOCKED('Locked'));
    expect(
      await denial(assertAllowed(checkout, action, locked, param)),
    ).toEqual([reason]);
  });

  it.each<[Action, string | undefined]>([
    ['transition', 'To Closed'],
    ['move', undefined],
    ['delete', undefined],
    ['editField', 'title'],
    ['editContent', undefined],
  ])('allows %s on a card without denials', async (action, param) => {
    const { checkout, free } = await fixture(LOCKED('Locked'));
    await expect(assertAllowed(checkout, action, free, param)).resolves.toBe(
      undefined,
    );
  });

  it.each<[Action, string]>([
    ['transition', 'To In Progress'],
    ['editField', 'labels'],
  ])('%s denials only apply to the named %s', async (action, param) => {
    const { checkout, locked } = await fixture(LOCKED('Locked'));
    await expect(assertAllowed(checkout, action, locked, param)).resolves.toBe(
      undefined,
    );
  });

  it('reports every reason when several rules deny the same action', async () => {
    const { checkout, locked } = await fixture(
      `deletingCardDenied(C, "first") :- field(C, "title", "Locked").
       deletingCardDenied(C, "second") :- field(C, "title", "Locked").`,
    );
    const reasons = await denial(assertAllowed(checkout, 'delete', locked));
    expect([...reasons].sort()).toEqual(['first', 'second']);
  });
});

describe('guarded entry points', () => {
  it('transition is denied and leaves the state alone', async () => {
    const { ws, locked } = await fixture(LOCKED('Locked'));
    const before = findCard(checkoutOf(ws), locked).metadata?.workflowState;
    expect(await denial(ws.cards.transition(locked, 'To Closed'))).toEqual([
      'no closing',
    ]);
    expect(findCard(checkoutOf(ws), locked).metadata?.workflowState).toBe(
      before,
    );
  });

  it('transition runs when the named transition is not denied', async () => {
    const { ws, locked } = await fixture(LOCKED('Locked'));
    await ws.cards.transition(locked, 'To In Progress');
    expect(findCard(checkoutOf(ws), locked).metadata?.workflowState).toBe(
      'In Progress',
    );
  });

  it('move is denied and leaves the card in place', async () => {
    const { ws, locked, other } = await fixture(LOCKED('Locked'));
    expect(await denial(ws.cards.move(locked, other))).toEqual(['no moving']);
    expect(findCard(checkoutOf(ws), locked).parent).toBe('root');
  });

  it('move runs for a card without denials', async () => {
    const { ws, free, other } = await fixture(LOCKED('Locked'));
    await ws.cards.move(free, other);
    expect(findCard(checkoutOf(ws), free).parent).toBe(other);
  });

  it('delete is denied and keeps the card', async () => {
    const { ws, locked } = await fixture(LOCKED('Locked'));
    expect(await denial(ws.cards.remove(locked))).toEqual(['no deleting']);
    expect(findCard(checkoutOf(ws), locked).key).toBe(locked);
  });

  it('delete runs for a card without denials', async () => {
    const { ws, free } = await fixture(LOCKED('Locked'));
    await ws.cards.remove(free);
    expect(() => findCard(checkoutOf(ws), free)).toThrow();
  });

  it('editField is denied and keeps the title', async () => {
    const { ws, locked } = await fixture(LOCKED('Locked'));
    expect(
      await denial(ws.cards.editField(locked, 'title', 'Renamed')),
    ).toEqual(['no title edit']);
    expect(findCard(checkoutOf(ws), locked).metadata?.title).toBe('Locked');
  });

  it('editField runs for a field that is not denied', async () => {
    const { ws, locked } = await fixture(LOCKED('Locked'));
    await ws.cards.editField(locked, 'labels', ['kept']);
    expect(findCard(checkoutOf(ws), locked).metadata?.labels).toEqual(['kept']);
  });

  it('editContent is denied and keeps the content', async () => {
    const { ws, locked } = await fixture(LOCKED('Locked'));
    expect(await denial(ws.cards.edit(locked, 'changed'))).toEqual([
      'no content edit',
    ]);
    expect(findCard(checkoutOf(ws), locked).content).toBe('original');
  });

  it('editContent runs for a card without denials', async () => {
    const { ws, free } = await fixture(LOCKED('Locked'));
    await ws.cards.edit(free, 'changed');
    expect(findCard(checkoutOf(ws), free).content).toBe('changed');
  });
});

describe('guard skip paths', () => {
  it('moving a card to its current parent returns before the guard', async () => {
    const { ws, locked, child } = await fixture(DENY_ALL);
    await ws.cards.move(child, locked);
    expect(findCard(checkoutOf(ws), child).parent).toBe(locked);
    // The same call to a different parent is guarded.
    expect(await denial(ws.cards.move(child, 'root'))).toEqual(['no moving']);
  });

  it('template cards skip the editContent guard', async () => {
    const { ws, template, free } = await fixture(DENY_ALL);
    await ws.cards.edit(template, 'changed');
    expect(findCard(checkoutOf(ws), template).content).toBe('changed');
    await denial(ws.cards.edit(free, 'changed'));
  });

  it('template cards skip the editField guard', async () => {
    const { ws, template, free } = await fixture(DENY_ALL);
    await ws.cards.editField(template, 'title', 'Renamed');
    expect(findCard(checkoutOf(ws), template).metadata?.title).toBe('Renamed');
    await denial(ws.cards.editField(free, 'title', 'Renamed'));
  });

  it('template cards skip the delete guard', async () => {
    const { ws, template, free } = await fixture(DENY_ALL);
    await ws.cards.remove(template);
    expect(() => findCard(checkoutOf(ws), template)).toThrow();
    await denial(ws.cards.remove(free));
  });
});
