// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { expect, it, describe } from 'vitest';
import Handlebars from 'handlebars';
import { graphvizReport } from '@cyberismo/assets';
import { registerReportHelpers } from '../../../src/domain/queries/handlebars-helpers.js';

// Renders the Graphviz report content template with a ready-made query result.
function renderDot(result: unknown) {
  const handlebars = Handlebars.create();
  registerReportHelpers(handlebars);
  return handlebars.compile(graphvizReport.content)({ results: [result] });
}

const node = (cardKey: string) => ({
  key: `(node,${cardKey})`,
  cardKey,
  isNode: 'void',
  attrs: [],
});

const edge = (source: string, destination: string) => ({
  key: `(edge,(${source},${destination},""))`,
  source,
  destination,
  attrs: [],
});

describe('graphviz report', () => {
  // Graphviz orders nodes by their first appearance in the DOT file. Nodes and
  // clusters must be declared before the edges that refer to them, or the
  // order of the children (the card tree order) is lost.
  it('declares nodes and clusters before edges, in the order of children', () => {
    const dot = renderDot({
      key: 'result',
      digraphs: [
        {
          key: 'toplevelGraph',
          attrs: [],
          children: [
            node('first'),
            {
              key: 'cluster',
              isGraph: 'void',
              attrs: [],
              children: [node('second')],
              edges: [edge('second', 'third')],
            },
            node('third'),
          ],
          edges: [edge('third', 'first')],
        },
      ],
    });

    const position = (text: string) => {
      const index = dot.indexOf(text);
      expect(index, `"${text}" not found in:\n${dot}`).toBeGreaterThan(-1);
      return index;
    };
    const first = position('"first" [');
    const cluster = position('subgraph cluster_cluster');
    const second = position('"second" [');
    const innerEdge = position('"second" -> "third"');
    const third = position('"third" [');
    const outerEdge = position('"third" -> "first"');

    expect(first).toBeLessThan(cluster);
    expect(cluster).toBeLessThan(second);
    expect(second).toBeLessThan(innerEdge);
    expect(innerEdge).toBeLessThan(third);
    expect(third).toBeLessThan(outerEdge);
  });
});
