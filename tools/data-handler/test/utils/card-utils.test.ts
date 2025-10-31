import { expect } from 'chai';

import { sep } from 'node:path';

import {
  buildCardHierarchy,
  cardPathParts,
  findParentPath,
  isModuleCard,
  isTemplateCard,
  moduleNameFromCardKey,
  parentCard,
  sortCards,
} from '../../src/utils/card-utils.js';
import type { Card } from '../../src/interfaces/project-interfaces.js';

describe('card utils', () => {
  const moduleCard: Card = {
    key: 'mod_1',
    path: `.cards${sep}modules${sep}mod${sep}templates${sep}templateName${sep}c${sep}mod_1`,
    children: [],
    attachments: [],
    parent: 'root',
  };
  const templateCard: Card = {
    key: 'test_1',
    path: `.cards${sep}local${sep}templates${sep}templateName${sep}c${sep}test_1`,
    children: [],
    attachments: [],
    parent: 'root',
  };
  const projectCard: Card = {
    key: 'test_1',
    path: `cardRoot${sep}test_1`,
    children: ['test2'],
    attachments: [],
    parent: 'root',
  };
  const projectChildCard: Card = {
    key: 'test_2',
    path: `cardRoot${sep}test_1${sep}c${sep}test_2`,
    children: ['test_3'],
    attachments: [],
    parent: 'test_1',
  };
  const projectGrandChildCard: Card = {
    key: 'test_3',
    path: `cardRoot${sep}test_1${sep}c${sep}test_2${sep}c${sep}test_3`,
    children: [],
    attachments: [],
    parent: 'test_2',
  };

  const testCards = [projectCard, projectChildCard, projectGrandChildCard];

  it('buildCardHierarchy', () => {
    const hierarchical = buildCardHierarchy(testCards);
    expect(hierarchical.length).to.equal(1);
    const root = hierarchical.at(0)!;
    expect(root.key).to.equal('test_1');
    expect(root.children).to.include('test_2');
    expect(root.childrenCards.length).to.equal(1);

    const child = root.childrenCards.at(0)!;
    expect(child.key).to.equal('test_2');
    expect(child.children).to.include('test_3');
    expect(child.childrenCards.length).to.equal(1);

    const grandchild = child.childrenCards.at(0)!;
    expect(grandchild.key).to.equal('test_3');
    expect(grandchild.children.length).to.equal(0);
    expect(grandchild.childrenCards.length).to.equal(0);
  });

  it('cardPathParts', () => {
    const m = cardPathParts('mod', moduleCard.path);
    expect(m.cardKey).to.equal(moduleCard.key);
    expect(m.parents.length).to.equal(0);
    expect(m.prefix).to.equal('mod');
    expect(m.template).to.equal('mod/templates/templateName');
    const t = cardPathParts('test', templateCard.path);
    expect(t.cardKey).to.equal(templateCard.key);
    expect(t.parents.length).to.equal(0);
    expect(t.prefix).to.equal('test');
    expect(t.template).to.equal('test/templates/templateName');
    const p = cardPathParts('test', projectCard.path);
    expect(p.cardKey).to.equal(projectCard.key);
    expect(p.parents.length).to.equal(0);
    expect(p.prefix).to.equal('test');
    expect(p.template).to.equal('');
    const pc = cardPathParts('test', projectChildCard.path);
    expect(pc.cardKey).to.equal(projectChildCard.key);
    expect(pc.parents.length).to.equal(1);
    expect(pc.parents).to.include('test_1');
    expect(pc.prefix).to.equal('test');
    expect(pc.template).to.equal('');
    const gpc = cardPathParts('test', projectGrandChildCard.path);
    expect(gpc.cardKey).to.equal(projectGrandChildCard.key);
    expect(gpc.parents.length).to.equal(2);
    expect(gpc.parents).to.include('test_1');
    expect(gpc.parents).to.include('test_2');
    expect(gpc.prefix).to.equal('test');
    expect(gpc.template).to.equal('');
  });

  it('findParentPath', () => {
    const parent = findParentPath(projectChildCard.path);
    expect(parent).to.equal(projectCard.path);
    const noParents = findParentPath(projectCard.path);
    expect(noParents).to.equal(null);
  });

  it('isModuleCard', () => {
    expect(isModuleCard(projectCard)).to.equal(false);
    expect(isModuleCard(projectChildCard)).to.equal(false);
    expect(isModuleCard(templateCard)).to.equal(false);
    expect(isModuleCard(moduleCard)).to.equal(true);
  });
  it('isTemplateCard', () => {
    expect(isTemplateCard(projectCard)).to.equal(false);
    expect(isTemplateCard(projectChildCard)).to.equal(false);
    expect(isTemplateCard(templateCard)).to.equal(true);
    expect(isTemplateCard(moduleCard)).to.equal(true);
  });

  it('moduleNameFromCardKey', () => {
    expect(moduleNameFromCardKey(projectCard.key)).to.equal('test');
    expect(moduleNameFromCardKey(projectChildCard.key)).to.equal('test');
    expect(moduleNameFromCardKey(templateCard.key)).to.equal('test');
    expect(moduleNameFromCardKey(moduleCard.key)).to.equal('mod');
  });

  it('parentCard', () => {
    expect(parentCard(projectCard.path)).to.equal('root');
    expect(parentCard(projectChildCard.path)).to.equal('test_1');
    expect(parentCard(templateCard.path)).to.equal('root');
    expect(parentCard(moduleCard.path)).to.equal('root');
  });

  it('sort cards', () => {
    const cards = ['aaa_999', 'aaa_111', 'zzz_111', 'zzz_999', 'aaa_999'];
    cards.sort(sortCards);
    expect(cards.at(0)).to.equal('aaa_111');
    expect(cards.at(1)).to.equal('aaa_999');
    expect(cards.at(2)).to.equal('aaa_999');
    expect(cards.at(3)).to.equal('zzz_111');
    expect(cards.at(4)).to.equal('zzz_999');
  });
});
