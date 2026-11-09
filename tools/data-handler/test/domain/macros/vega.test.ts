// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';

import VegaMacro from '../../../src/domain/macros/vega/index.js';
import TaskQueue from '../../../src/domain/macros/task-queue.js';
import type { MacroGenerationContext } from '../../../src/shared/interfaces/macros.js';
import type { Context } from '@cyberismo/model';

// Two bars coloured by CSS colour functions, with axis labels in the text colour
const spec = {
  width: 40,
  height: 40,
  data: [
    {
      name: 'table',
      values: [
        { a: 'x', b: 1 },
        { a: 'y', b: 2 },
      ],
    },
  ],
  scales: [
    {
      name: 'x',
      type: 'band',
      domain: { data: 'table', field: 'a' },
      range: 'width',
    },
    {
      name: 'color',
      type: 'ordinal',
      domain: { data: 'table', field: 'a' },
      range: ['light-dark(#9c1c1c,#f06a6a)', 'light-dark(rgb(1, 2, 3), #fff)'],
    },
  ],
  axes: [{ orient: 'bottom', scale: 'x', labelColor: 'currentColor' }],
  marks: [
    {
      type: 'rect',
      from: { data: 'table' },
      encode: {
        enter: {
          x: { scale: 'x', field: 'a' },
          width: { value: 10 },
          y: { value: 0 },
          height: { value: 10 },
          fill: { scale: 'color', field: 'a' },
        },
      },
    },
  ],
};

// The SVG the macro renders in the given context.
const render = async (context: Context) => {
  const output = await new VegaMacro(new TaskQueue()).handleStatic(
    { mode: 'static', context, cardKey: '' } as MacroGenerationContext,
    { spec },
  );
  const base64 = /base64,([^[]+)\[/.exec(output)![1];
  return Buffer.from(base64, 'base64').toString('utf-8');
};

describe('vega macro', () => {
  it('draws CSS colour functions in a PDF as the light page colours', async () => {
    const svg = await render('exportedDocument');

    expect(svg).toContain('fill="#9c1c1c"');
    expect(svg).toContain('fill="rgb(1, 2, 3)"');
    expect(svg).toContain('fill="#333333"');
    expect(svg).not.toContain('light-dark');
    expect(svg).not.toContain('currentColor');
  });

  it('leaves CSS colour functions to the browser elsewhere', async () => {
    const svg = await render('exportedSite');

    expect(svg).toContain('fill="light-dark(#9c1c1c,#f06a6a)"');
    expect(svg).toContain('fill="currentColor"');
  });
});
