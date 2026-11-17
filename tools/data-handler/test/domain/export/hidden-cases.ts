// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// Which cards an export holds when some are hidden from the tree view. The
// site and adoc exports (tree query and exportedTree) and the PDF export (its
// report query) each implement the rule, so all run this one table. The adoc
// export always holds the descendants, so it skips the rows that leave them out.

import type { CardSpec, ProjectSpec } from '../../helpers/project-builder.js';

// Top(Kid, Gone(GoneLeaf)), Hid(HidMid(HidLeaf)), Other.
const tree: CardSpec[] = [
  {
    title: 'Top',
    children: [
      { title: 'Kid' },
      { title: 'Gone', children: [{ title: 'GoneLeaf' }] },
    ],
  },
  {
    title: 'Hid',
    children: [{ title: 'HidMid', children: [{ title: 'HidLeaf' }] }],
  },
  { title: 'Other' },
];

// The titles of the cards, in the depth-first order of the project keys.
const flatten = (cards: CardSpec[]): string[] =>
  cards.flatMap((card) => [card.title!, ...flatten(card.children ?? [])]);
const titles = flatten(tree);

export interface HiddenCase {
  name: string;
  /** Cards hidden from the tree view by content; their descendants inherit it. */
  hidden: string[];
  /** The card the export starts from; none for the project. */
  start?: string;
  /** Whether an export from a card holds its descendants; by default it does. */
  recursive?: boolean;
  /** The titles of the exported cards. */
  exported: string[];
}

export const hiddenCases: HiddenCase[] = [
  {
    name: 'a project export leaves out hidden cards and their descendants',
    hidden: ['Gone', 'Hid'],
    exported: ['Top', 'Kid', 'Other'],
  },
  {
    name: 'an export from a visible card leaves out its hidden child',
    hidden: ['Gone'],
    start: 'Top',
    exported: ['Top', 'Kid'],
  },
  {
    name: 'an export from a visible card leaves out its hidden grandchild',
    hidden: ['GoneLeaf'],
    start: 'Top',
    exported: ['Top', 'Kid', 'Gone'],
  },
  {
    name: 'an export from a hidden card holds its whole subtree',
    hidden: ['Hid'],
    start: 'Hid',
    exported: ['Hid', 'HidMid', 'HidLeaf'],
  },
  {
    name: 'an export from a card hidden through its parent holds its whole subtree',
    hidden: ['Hid'],
    start: 'HidMid',
    exported: ['HidMid', 'HidLeaf'],
  },
  {
    name: 'an export of a hidden card without its descendants holds the card',
    hidden: ['Hid'],
    start: 'Hid',
    recursive: false,
    exported: ['Hid'],
  },
  // Known limit: under a hidden start card, a card hidden on its own counts as
  // hidden through the start card, so it is exported.
  {
    name: 'an export from a hidden card holds a descendant hidden on its own too',
    hidden: ['Hid', 'HidLeaf'],
    start: 'Hid',
    exported: ['Hid', 'HidMid', 'HidLeaf'],
  },
];

/** The project of a case: the tree, with its hidden cards hidden by a calculation. */
export const hiddenCaseSpec = (hidden: string[]): ProjectSpec => ({
  cards: tree,
  calculations: {
    hide: hidden
      .map((title) => `hiddenInTreeView(C) :- field(C, "title", "${title}").\n`)
      .join(''),
  },
});

/** The key of the card with the given title, from the project keys. */
export const keyOf = (keys: string[], title: string) =>
  keys[titles.indexOf(title)];

/** The titles of the given keys, sorted. */
export const titlesOf = (keys: string[], exportedKeys: Iterable<string>) =>
  [...new Set(exportedKeys)].map((key) => titles[keys.indexOf(key)]).sort();
