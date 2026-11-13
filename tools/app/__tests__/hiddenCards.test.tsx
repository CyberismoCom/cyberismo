// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router';
import type { QueryResult } from '@cyberismo/model';
import { ProjectBreadcrumbs } from '@/components/ProjectBreadcrumbs';
import { LinkForm } from '@/components/card/linked-cards-section/EditMode';
import type { ExpandedLinkType } from '@/lib/definitions';
import { withoutHiddenCards } from '@/lib/utils';

type Node = QueryResult<'tree'>;

const node = (key: string, isHidden: boolean, children?: Node[]): Node => ({
  key,
  title: `Title ${key}`,
  rank: '0|a',
  cardType: 'test/cardTypes/page',
  policyChecks: {},
  deniedOperations: {},
  isHidden,
  children,
});

// top > secret (hidden) > inner (hidden, inherited), top > shown
const tree = [
  node('top_1', false, [
    node('top_2', true, [node('top_3', true)]),
    node('top_4', false),
  ]),
];

describe('withoutHiddenCards', () => {
  it('drops hidden cards together with their descendants', () => {
    const keys = (nodes: Node[]): string[] =>
      nodes.flatMap((n) => [n.key, ...keys(n.children ?? [])]);

    expect(keys(withoutHiddenCards(tree))).toEqual(['top_1', 'top_4']);
  });
});

describe('ProjectBreadcrumbs', () => {
  it.each(['top_2', 'top_3'])('shows the path to hidden card %s', (key) => {
    render(
      <MemoryRouter>
        <ProjectBreadcrumbs cardKey={key} tree={tree} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Title top_1')).toBeInTheDocument();
    expect(screen.getByText(`Title ${key} - ${key}`)).toBeInTheDocument();
  });
});

describe('link editor', () => {
  it('offers a hidden card as a link target', () => {
    const linkType = {
      id: 0,
      name: 'test/linkTypes/relates',
      direction: 'outbound',
      outboundDisplayName: 'relates to',
      inboundDisplayName: 'relates from',
      sourceCardTypes: [],
      destinationCardTypes: [],
    } as unknown as ExpandedLinkType;

    render(
      <LinkForm
        mode="add"
        cards={tree}
        linkTypes={[linkType]}
        cardKey="top_4"
        currentCardLinks={[]}
        data={{
          linkType: 0,
          connector: 'card',
          cardKey: 'top_2',
          externalItemKey: '',
          linkDescription: '',
        }}
      />,
    );

    // a selection outside the usable cards is cleared, so it shows only when offered
    expect(screen.getByDisplayValue('Title top_2(top_2)')).toBeInTheDocument();
  });
});
