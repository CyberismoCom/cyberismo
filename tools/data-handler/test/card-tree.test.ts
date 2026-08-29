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

// testing
import { expect, describe, it, beforeEach, afterEach } from 'vitest';

// node
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CardTree } from '../src/containers/project/card-tree.js';
import { CardKeyRegistry } from '../src/containers/project/card-keys.js';
import { CardNotFoundError } from '../src/exceptions/index.js';
import type { CardMetadata } from '../src/interfaces/project-interfaces.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-card-tree-tests');
const cardRoot = join(testDir, 'cardRoot');

const CARD_KEY = 'test_1';
const ATTACHMENT = 'diagram.png';

// Writes a card folder under 'parentPath', which defaults to the tree root.
// A rank of '' leaves the card unranked.
function createCardAt(
  cardKey: string,
  options: {
    parentPath?: string;
    rank?: string;
    attachments?: string[];
  } = {},
) {
  const cardPath = join(options.parentPath ?? cardRoot, cardKey);
  mkdirSync(cardPath, { recursive: true });
  writeFileSync(
    join(cardPath, 'index.json'),
    JSON.stringify({
      title: 'Card',
      cardType: 'test/cardTypes/page',
      workflowState: 'Draft',
      rank: options.rank ?? '0|a',
      links: [
        {
          linkType: 'test/linkTypes/rel',
          cardKey: 'test_2',
        },
      ],
    } as unknown as CardMetadata),
  );
  writeFileSync(join(cardPath, 'index.adoc'), `image::${ATTACHMENT}[]\n`);

  const attachments = options.attachments ?? [];
  if (attachments.length > 0) {
    mkdirSync(join(cardPath, 'a'), { recursive: true });
    for (const attachment of attachments) {
      writeFileSync(join(cardPath, 'a', attachment), `body of ${attachment}`);
    }
  }
  return cardPath;
}

function createCard(cardKey: string, attachments: string[] = []) {
  return createCardAt(cardKey, { attachments });
}

function newTree(): CardTree {
  return new CardTree({
    name: 'project',
    rootPath: cardRoot,
    writable: true,
    emitsCardFact: true,
    validationApplies: true,
    keys: new CardKeyRegistry(() => 'test'),
  });
}

describe('CardTree.renameAttachment', () => {
  let tree: CardTree;
  let cardPath: string;

  beforeEach(async () => {
    mkdirSync(cardRoot, { recursive: true });
    cardPath = createCard(CARD_KEY, [ATTACHMENT]);
    tree = newTree();
    await tree.load();
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('renames the file and updates the cached attachment', async () => {
    const before = tree.attachmentsOf(CARD_KEY);
    expect(before).toHaveLength(1);
    expect(before[0].fileName).toBe(ATTACHMENT);
    expect(before[0].mimeType).toBe('image/png');

    await tree.renameAttachment(CARD_KEY, ATTACHMENT, 'renamed.svg');

    // On disk.
    await expect(
      readFile(join(cardPath, 'a', 'renamed.svg'), 'utf-8'),
    ).resolves.toBe(`body of ${ATTACHMENT}`);
    await expect(
      readFile(join(cardPath, 'a', ATTACHMENT), 'utf-8'),
    ).rejects.toThrow(/ENOENT/);

    // And in the tree: the old fileName going stale here is the defect this
    // primitive exists to close. The mime type follows the new extension, so
    // the entry matches what a reload from disk would produce.
    const after = tree.attachmentsOf(CARD_KEY);
    expect(after).toHaveLength(1);
    expect(after[0].fileName).toBe('renamed.svg');
    expect(after[0].mimeType).toBe('image/svg+xml');
    expect(after[0].card).toBe(CARD_KEY);
    expect(after[0].path).toBe(join(cardPath, 'a'));
  });

  it('is a no-op when the name does not change', async () => {
    await tree.renameAttachment(CARD_KEY, ATTACHMENT, ATTACHMENT);

    await expect(
      readFile(join(cardPath, 'a', ATTACHMENT), 'utf-8'),
    ).resolves.toBe(`body of ${ATTACHMENT}`);
    expect(tree.attachmentsOf(CARD_KEY)[0].fileName).toBe(ATTACHMENT);
  });

  it('throws for an attachment the card does not have', async () => {
    await expect(
      tree.renameAttachment(CARD_KEY, 'nope.png', 'other.png'),
    ).rejects.toThrow('Attachment not found: nope.png');
  });

  it('throws for a card the tree does not hold', async () => {
    await expect(
      tree.renameAttachment('test_999', ATTACHMENT, 'other.png'),
    ).rejects.toThrow(CardNotFoundError);
  });
});

describe('CardTree read boundary', () => {
  let tree: CardTree;

  beforeEach(async () => {
    mkdirSync(cardRoot, { recursive: true });
    createCard(CARD_KEY, [ATTACHMENT]);
    tree = newTree();
    await tree.load();
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  // The metadata-level read shares the stored metadata object rather than
  // cloning it, so the store freezes what it holds. Without the freeze this
  // assignment silently rewrites the cache.
  it('refuses writes to the metadata a node read shares', () => {
    const node = tree.node(CARD_KEY);
    expect(Object.isFrozen(node.metadata)).toBe(true);
    expect(() => {
      node.metadata!.title = 'edited';
    }).toThrow(TypeError);
    expect(tree.node(CARD_KEY).metadata!.title).toBe('Card');
  });

  it('refuses writes to the arrays and link objects inside stored metadata', () => {
    const links = tree.node(CARD_KEY).metadata!.links;
    expect(() => links.push({ linkType: 'x', cardKey: 'test_9' })).toThrow(
      TypeError,
    );
    expect(() => {
      links[0].linkType = 'edited';
    }).toThrow(TypeError);
    expect(tree.node(CARD_KEY).metadata!.links[0].linkType).toBe(
      'test/linkTypes/rel',
    );
  });

  it('hands out a card whose metadata can be edited without touching the store', async () => {
    const card = await tree.card(CARD_KEY);
    expect(Object.isFrozen(card.metadata)).toBe(false);

    card.metadata!.title = 'edited';
    card.metadata!.links.push({ linkType: 'x', cardKey: 'test_9' });

    expect((await tree.card(CARD_KEY)).metadata!.title).toBe('Card');
    expect((await tree.card(CARD_KEY)).metadata!.links).toHaveLength(1);
  });

  it('hands out attachments and children that can be edited without touching the store', async () => {
    const card = await tree.card(CARD_KEY);
    card.attachments[0].fileName = 'edited.png';
    card.children.push('test_9');

    expect((await tree.card(CARD_KEY)).attachments[0].fileName).toBe(
      ATTACHMENT,
    );
    expect(tree.attachmentsOf(CARD_KEY)[0].fileName).toBe(ATTACHMENT);
    expect((await tree.card(CARD_KEY)).children).toHaveLength(0);
    expect(tree.childrenOf(CARD_KEY)).toHaveLength(0);
  });

  it('hands out only the fields a Card has', async () => {
    for (const card of [
      await tree.card(CARD_KEY),
      ...(await tree.cards()),
      ...(await tree.rootCards()),
      ...(await tree.cardsFor([CARD_KEY])),
    ]) {
      expect(Object.keys(card).sort()).toEqual([
        'attachments',
        'children',
        'content',
        'key',
        'metadata',
        'parent',
        'path',
      ]);
    }
  });
});

describe('CardTree ranks', () => {
  let tree: CardTree;

  beforeEach(() => {
    mkdirSync(cardRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  // Loads a tree over root cards with the given ranks, keyed test_1..test_n.
  async function withRootRanks(...ranks: string[]): Promise<string[]> {
    const keys = ranks.map((rank, index) => {
      const key = `test_${index + 1}`;
      createCardAt(key, { rank });
      return key;
    });
    tree = newTree();
    await tree.load();
    return keys;
  }

  it('orders siblings by rank, unranked last', async () => {
    await withRootRanks('0|c', '', '0|a', '0|b');
    expect(tree.siblingsUnder('root')).toEqual([
      'test_3',
      'test_4',
      'test_1',
      'test_2',
    ]);
  });

  it('allocates a block after the last ranked sibling', async () => {
    await withRootRanks('0|a', '0|b');
    expect(tree.rankBlock('root', 3)).toEqual(['0|c', '0|d', '0|e']);
  });

  it('allocates a block after FIRST_RANK when nothing is ranked', async () => {
    // '0|a' stays free so rankFirst can claim it without demoting anyone.
    expect(newTree().rankBlock('root', 2)).toEqual(['0|b', '0|c']);
  });

  it('allocates a block under a parent card', async () => {
    createCardAt('test_1', { rank: '0|a' });
    createCardAt('test_2', {
      parentPath: join(cardRoot, 'test_1', 'c'),
      rank: '0|f',
    });
    tree = newTree();
    await tree.load();

    expect(tree.rankBlock('test_1', 2)).toEqual(['0|g', '0|h']);
    // The parent's own sibling set is a different one.
    expect(tree.rankBlock('root', 1)).toEqual(['0|b']);
  });

  it('ranks a card after the last sibling', async () => {
    const [first, , third] = await withRootRanks('0|a', '0|b', '0|c');
    expect(tree.rankAfter(first, third)).toEqual([
      { cardKey: first, rank: '0|d' },
    ]);
  });

  it('ranks a card between two siblings', async () => {
    const [first, second] = await withRootRanks('0|a', '0|b', '0|c');
    expect(tree.rankAfter(first, second)).toEqual([
      { cardKey: first, rank: '0|bn' },
    ]);
  });

  it('ranks a card first, and demotes whoever holds the first rank', async () => {
    const [first, , third] = await withRootRanks('0|a', '0|m', '0|z');
    expect(tree.rankFirst(third)).toEqual([
      { cardKey: first, rank: '0|g' },
      { cardKey: third, rank: '0|a' },
    ]);
  });

  it('leaves a card that is already first alone', async () => {
    const [first] = await withRootRanks('0|a', '0|b');
    expect(tree.rankFirst(first)).toEqual([]);
  });

  it('takes the first rank directly when nobody holds it', async () => {
    const [, second] = await withRootRanks('0|b', '0|c');
    expect(tree.rankFirst(second)).toEqual([{ cardKey: second, rank: '0|a' }]);
  });

  // Duplicate ranks are drift the arithmetic refuses to work with, so the
  // sibling set is repaired first and the placement computed against the
  // repaired ranks.
  it('rebalances drifted sibling ranks before placing a card', async () => {
    const [first, second, third] = await withRootRanks('0|a', '0|b', '0|b');
    expect(tree.rankAfter(first, second)).toEqual([
      { cardKey: first, rank: '0|a' },
      { cardKey: second, rank: '0|m' },
      { cardKey: third, rank: '0|z' },
      { cardKey: first, rank: '0|s' },
    ]);
  });

  it('rebalances an unranked sibling set', async () => {
    const [first, second] = await withRootRanks('', '');
    expect(tree.rankAfter(second, first)).toEqual([
      { cardKey: first, rank: '0|a' },
      { cardKey: second, rank: '0|z' },
      // Then placed between the repaired ranks of the two siblings.
      { cardKey: second, rank: '0|m' },
    ]);
  });

  it('spreads a rebalance across the whole rank space', async () => {
    const keys = await withRootRanks('0|a', '0|b', '0|c');
    expect(tree.rebalanceUnder('root')).toEqual([
      { cardKey: keys[0], rank: '0|a' },
      { cardKey: keys[1], rank: '0|m' },
      { cardKey: keys[2], rank: '0|z' },
    ]);
  });

  it('rebalances a subtree level by level', async () => {
    createCardAt('test_1', { rank: '0|a' });
    createCardAt('test_2', { rank: '0|b' });
    const children = join(cardRoot, 'test_1', 'c');
    createCardAt('test_3', { parentPath: children, rank: '0|y' });
    createCardAt('test_4', { parentPath: children, rank: '0|z' });
    tree = newTree();
    await tree.load();

    expect(tree.rebalanceSubtree('root')).toEqual([
      { cardKey: 'test_1', rank: '0|a' },
      { cardKey: 'test_2', rank: '0|z' },
      { cardKey: 'test_3', rank: '0|a' },
      { cardKey: 'test_4', rank: '0|z' },
    ]);
  });

  // 500 appends is past the 158-card ceiling the Number-based rank arithmetic
  // saturated at: there getRankAfter started returning its own input, so the
  // 159th card and every card after it got the 158th card's rank.
  it('appends 500 cards to the same parent without repeating a rank', async () => {
    await withRootRanks('0|a');
    const seen = new Set<string>(['0|a']);
    let previous = '0|a';

    for (let index = 0; index < 500; index++) {
      const [rank] = tree.rankBlock('root', 1);
      expect(seen.has(rank), `rank ${rank} was handed out twice`).toBe(false);
      expect(rank > previous, `${rank} must be after ${previous}`).toBe(true);
      seen.add(rank);
      previous = rank;

      // Into the tree, so the next allocation sees it as the last sibling.
      const cardKey = `test_append${index}`;
      tree.insert({
        key: cardKey,
        path: tree.pathFor('root', cardKey),
        parent: 'root',
        children: [],
        attachments: [],
        content: '',
        metadata: {
          title: 'Card',
          cardType: 'test/cardTypes/page',
          workflowState: 'Draft',
          rank,
          links: [],
        },
      });
    }

    expect(seen.size).toBe(501);
  });
});

describe('CardTree structural integrity', () => {
  let tree: CardTree;

  // A three-generation line: test_1 -> test_2 -> test_3.
  beforeEach(async () => {
    mkdirSync(cardRoot, { recursive: true });
    createCardAt('test_1');
    createCardAt('test_2', { parentPath: join(cardRoot, 'test_1', 'c') });
    createCardAt('test_3', {
      parentPath: join(cardRoot, 'test_1', 'c', 'test_2', 'c'),
    });
    tree = newTree();
    await tree.load();
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  // Card paths are derived by walking parent edges up to the root, so a cycle
  // is not a wrong path - it is no path: pathOf would never terminate.
  it.each([
    ['its own child', 'test_1', 'test_2'],
    ['its own grandchild', 'test_1', 'test_3'],
    ['itself', 'test_2', 'test_2'],
  ])('refuses to relocate a card under %s', (_case, cardKey, parent) => {
    expect(() => tree.relocate(cardKey, parent)).toThrow(
      `Card '${cardKey}' cannot be placed under '${parent}'`,
    );
    // And the tree is unchanged, so paths still resolve.
    expect(tree.pathOf('test_3')).toBe(
      join(cardRoot, 'test_1', 'c', 'test_2', 'c', 'test_3'),
    );
  });

  it('allows relocating a card under an unrelated card', () => {
    createCardAt('test_9');
    tree.insert({
      key: 'test_9',
      path: join(cardRoot, 'test_9'),
      parent: 'root',
      children: [],
      attachments: [],
      content: '',
      metadata: {
        title: 'Card',
        cardType: 'test/cardTypes/page',
        workflowState: 'Draft',
        rank: '0|b',
        links: [],
      },
    });

    tree.relocate('test_1', 'test_9');
    expect(tree.pathOf('test_3')).toBe(
      join(cardRoot, 'test_9', 'c', 'test_1', 'c', 'test_2', 'c', 'test_3'),
    );
  });

  it('refuses to graft a subtree under one of its own cards', () => {
    const subtree = tree.uproot('test_1');
    expect(subtree.map((card) => card.key)).toEqual([
      'test_1',
      'test_2',
      'test_3',
    ]);

    expect(() => tree.graft(subtree, 'test_2')).toThrow(
      `Card 'test_1' cannot be grafted under 'test_2'`,
    );
  });
});

describe('CardTree fact changes', () => {
  let tree: CardTree;

  // A three-generation line: test_1 -> test_2 -> test_3.
  beforeEach(async () => {
    mkdirSync(cardRoot, { recursive: true });
    createCardAt('test_1');
    createCardAt('test_2', { parentPath: join(cardRoot, 'test_1', 'c') });
    createCardAt('test_3', {
      parentPath: join(cardRoot, 'test_1', 'c', 'test_2', 'c'),
    });
    tree = newTree();
    await tree.load();
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  // The tree is loaded in beforeEach, so every test that wants to observe one
  // operation's marks starts from a drained tree.
  function drain() {
    tree.takeFactChanges();
  }

  function newCard(cardKey: string, parent = 'root') {
    return {
      key: cardKey,
      path: tree.pathFor(parent, cardKey),
      parent,
      children: [],
      attachments: [],
      content: '',
      metadata: {
        title: 'Card',
        cardType: 'test/cardTypes/page',
        workflowState: 'Draft',
        rank: '0|c',
        links: [],
      },
    };
  }

  it('marks every loaded card', () => {
    expect(tree.hasFactChanges).toBe(true);
    const changes = tree.takeFactChanges();
    expect(changes.changed.sort()).toEqual(['test_1', 'test_2', 'test_3']);
    expect(changes.removed).toEqual([]);
  });

  it('leaves the tree clean once the changes are taken', () => {
    tree.takeFactChanges();
    expect(tree.hasFactChanges).toBe(false);
    expect(tree.takeFactChanges()).toEqual({ changed: [], removed: [] });
  });

  it('marks an inserted card', () => {
    drain();
    createCardAt('test_4');
    tree.insert(newCard('test_4'));
    expect(tree.takeFactChanges()).toEqual({
      changed: ['test_4'],
      removed: [],
    });
  });

  it('marks a card whose metadata was written', async () => {
    drain();
    const card = await tree.card('test_2');
    card.metadata!.title = 'Renamed';
    await tree.writeMetadata(card);
    expect(tree.takeFactChanges()).toEqual({
      changed: ['test_2'],
      removed: [],
    });
  });

  // A card's facts are built from its metadata, not from its content, so a
  // content write has nothing to reproject.
  it('marks nothing for a content write', async () => {
    drain();
    const card = await tree.card('test_2');
    card.content = 'new body';
    await tree.writeContent(card);
    expect(tree.hasFactChanges).toBe(false);
  });

  // Nor from its attachments.
  it('marks nothing for an attachment write', async () => {
    drain();
    await tree.addAttachment('test_2', 'picture.png', Buffer.from('x'));
    expect(tree.hasFactChanges).toBe(false);
  });

  // Only the moved card: a descendant's parent edge is untouched, and paths
  // are not projected.
  it('marks only the relocated card', () => {
    drain();
    tree.relocate('test_2', 'root');
    expect(tree.takeFactChanges()).toEqual({
      changed: ['test_2'],
      removed: [],
    });
  });

  it('marks a deleted subtree as removed', async () => {
    drain();
    await tree.deleteSubtree('test_2');
    const changes = tree.takeFactChanges();
    expect(changes.changed).toEqual([]);
    expect(changes.removed.sort()).toEqual(['test_2', 'test_3']);
  });

  it('marks an uprooted subtree as removed and a grafted one as changed', () => {
    drain();
    const subtree = tree.uproot('test_2');
    const uprooted = tree.takeFactChanges();
    expect(uprooted.changed).toEqual([]);
    expect(uprooted.removed.sort()).toEqual(['test_2', 'test_3']);

    tree.graft(subtree, 'root');
    expect(tree.takeFactChanges()).toEqual({
      changed: ['test_2', 'test_3'],
      removed: [],
    });
  });

  it('marks a card changed after it was marked removed', async () => {
    drain();
    await tree.deleteSubtree('test_3');
    createCardAt('test_3');
    tree.insert(newCard('test_3'));
    expect(tree.takeFactChanges()).toEqual({
      changed: ['test_3'],
      removed: [],
    });
  });

  it('marks every card of a cleared tree as removed', () => {
    drain();
    tree.clear();
    const changes = tree.takeFactChanges();
    expect(changes.changed).toEqual([]);
    expect(changes.removed.sort()).toEqual(['test_1', 'test_2', 'test_3']);
  });

  // A reload keeps the cards it reads: they are changed, not removed.
  it('marks a reloaded card changed rather than removed', async () => {
    drain();
    await tree.reload();
    const changes = tree.takeFactChanges();
    expect(changes.changed.sort()).toEqual(['test_1', 'test_2', 'test_3']);
    expect(changes.removed).toEqual([]);
  });

  // A card that disappeared from disk between the clear and the load stays
  // removed.
  it('keeps a card that a reload no longer finds removed', async () => {
    drain();
    rmSync(join(cardRoot, 'test_1'), { recursive: true, force: true });
    await tree.reload();
    expect(tree.takeFactChanges()).toEqual({
      changed: [],
      removed: ['test_1', 'test_2', 'test_3'],
    });
  });

  // A template's root cards name the template itself as their parent.
  it('marks every card when the tree is renamed', () => {
    drain();
    tree.rebase('test/templates/other', cardRoot);
    const changes = tree.takeFactChanges();
    expect(changes.changed.sort()).toEqual(['test_1', 'test_2', 'test_3']);
  });
});

// Attachment listings come out of the one recursive sweep the load already
// does, rather than a per-card existsSync plus readdir.
describe('CardTree attachment listings', () => {
  let tree: CardTree;

  beforeEach(() => {
    mkdirSync(cardRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  function attach(cardPath: string, name: string, dir = '') {
    const folder = join(cardPath, 'a', dir);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, name), `body of ${name}`);
  }

  it('lists a card with no attachments as having none', async () => {
    createCardAt('test_1');
    tree = newTree();
    await tree.load();

    expect(tree.attachmentsOf('test_1')).toEqual([]);
  });

  it('records the folder an attachment sits in below the card', async () => {
    const cardPath = createCardAt('test_1');
    attach(cardPath, 'flat.png');
    attach(cardPath, 'nested.png', 'deep');
    tree = newTree();
    await tree.load();

    const attachments = tree.attachmentsOf('test_1');
    expect(
      attachments.map((item) => [item.fileName, item.path]).sort(),
    ).toEqual([
      ['deep', join(cardPath, 'a')],
      ['flat.png', join(cardPath, 'a')],
      ['nested.png', join(cardPath, 'a', 'deep')],
    ]);
  });

  // The sweep sees every 'a' folder in the tree at once, so an attachment has
  // to be traced back to the card whose folder it is actually in.
  it('gives a nested card its own attachments', async () => {
    const parentPath = createCardAt('test_1');
    const childPath = createCardAt('test_2', {
      parentPath: join(cardRoot, 'test_1', 'c'),
    });
    attach(parentPath, 'parent.png');
    attach(childPath, 'child.png');
    tree = newTree();
    await tree.load();

    expect(tree.attachmentsOf('test_1').map((item) => item.fileName)).toEqual([
      'parent.png',
    ]);
    const child = tree.attachmentsOf('test_2');
    expect(child.map((item) => item.fileName)).toEqual(['child.png']);
    expect(child[0].path).toBe(join(childPath, 'a'));
  });

  // A card's own files are not attachments, and neither is anything in the
  // children folder.
  it('leaves a card own files out of the listing', async () => {
    const cardPath = createCardAt('test_1');
    createCardAt('test_2', { parentPath: join(cardRoot, 'test_1', 'c') });
    attach(cardPath, 'real.png');
    tree = newTree();
    await tree.load();

    expect(tree.attachmentsOf('test_1').map((item) => item.fileName)).toEqual([
      'real.png',
    ]);
  });
});

// A card's content is not read when the tree is loaded: nothing about a card's
// facts is built from it, and the first solve reads every card. It is read the
// first time somebody asks for it.
describe('CardTree lazy content', () => {
  let tree: CardTree;
  let cardPath: string;

  const LOADED_CONTENT = `image::${ATTACHMENT}[]\n`;

  beforeEach(async () => {
    mkdirSync(cardRoot, { recursive: true });
    cardPath = createCardAt('test_1');
    tree = newTree();
    await tree.load();
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  // Rewritten after the load: had the load read the file, the tree would
  // answer with what stood in it then.
  it('answers with what the content file holds when it is first asked', async () => {
    writeFileSync(join(cardPath, 'index.adoc'), 'written after the load');

    await expect(tree.content('test_1')).resolves.toBe(
      'written after the load',
    );
  });

  // The other half of the same proof: with nothing cached by the load, taking
  // the file away leaves the tree with nothing to answer from.
  it('has nothing cached for a card whose content it has not read', async () => {
    rmSync(join(cardPath, 'index.adoc'));

    await expect(tree.content('test_1')).rejects.toThrow(/ENOENT/);
  });

  // And the metadata-level read does not go near it, which is what makes fact
  // projection free of content reads.
  it('answers a metadata read for a card with no content file', () => {
    rmSync(join(cardPath, 'index.adoc'));

    expect(tree.node('test_1').metadata!.title).toBe('Card');
    expect(tree.nodes()).toHaveLength(1);
  });

  it('reads the content file once', async () => {
    await expect(tree.content('test_1')).resolves.toBe(LOADED_CONTENT);
    writeFileSync(join(cardPath, 'index.adoc'), 'rewritten behind the tree');

    await expect(tree.content('test_1')).resolves.toBe(LOADED_CONTENT);
  });

  it('hydrates the content of the cards a hydrated read returns', async () => {
    const cards = await tree.cards();
    expect(cards.map((card) => card.content)).toEqual([LOADED_CONTENT]);
    expect((await tree.card('test_1')).content).toBe(LOADED_CONTENT);
    expect((await tree.rootCards())[0].content).toBe(LOADED_CONTENT);
    expect((await tree.cardsFor(['test_1']))[0].content).toBe(LOADED_CONTENT);
  });

  // A written card's content is the caller's, so there is nothing to read back.
  it('needs no read for a card it was given the content of', async () => {
    createCardAt('test_2');
    tree.insert({
      key: 'test_2',
      path: join(cardRoot, 'test_2'),
      parent: 'root',
      children: [],
      attachments: [],
      content: 'handed to the tree',
      metadata: {
        title: 'Card',
        cardType: 'test/cardTypes/page',
        workflowState: 'Draft',
        rank: '0|b',
        links: [],
      },
    });
    rmSync(join(cardRoot, 'test_2', 'index.adoc'));

    await expect(tree.content('test_2')).resolves.toBe('handed to the tree');
  });

  it('needs no read for a card whose content it has just written', async () => {
    const card = await tree.card('test_1');
    await tree.writeContent({ ...card, content: 'written through the tree' });
    rmSync(join(cardPath, 'index.adoc'));

    await expect(tree.content('test_1')).resolves.toBe(
      'written through the tree',
    );
  });
});
