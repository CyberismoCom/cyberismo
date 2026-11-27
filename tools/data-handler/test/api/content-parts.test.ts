// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';

import type {
  RenderedContent,
  RenderedPart,
  RenderOptions,
} from '@cyberismo/model';
import { partId } from '../../src/domain/macros/parts.js';
import { PART_REFERENCES } from '../helpers/content-parts.js';
import { projects } from '../domain/cards/fixture.js';

const open = projects();

const VEGA_SPEC = {
  $schema: 'https://vega.github.io/schema/vega/v5.json',
  width: 10,
  height: 10,
  marks: [],
};
const MACROS = {
  createCards: '"buttonLabel": "New", "template": "test/templates/tpl"',
  createLinks:
    '"linkType": "test/linkTypes/related", "query": "result(C) :- projectCard(C)."',
  field: '"field": "title"',
  fieldInline: '"field": "title", "display": "inline"',
  mermaid: '"code": "graph TD; A-->B"',
  vega: `"spec": ${JSON.stringify(VEGA_SPEC)}`,
};
const macro = (name: string, options: string) =>
  `{{#${name}}}${options}{{/${name}}}`;
const action = (label = 'Go') =>
  `{{#action}}"buttonLabel": "${label}", "actions": [{{#quoted}}a.{{/quoted}}]{{/action}}`;

const spec = {
  linkTypes: [{ name: 'related' }],
  templates: [{ name: 'tpl', cards: [{ title: 'Template card' }] }],
  reports: {
    buttons: { query: '', content: `Report ${action()}` },
    // The first button is placed before the second one fails the report.
    broken: {
      query: '',
      content: `${action()} {{#action}}"buttonLabel": "Bad", "actions": [,]{{/action}}`,
    },
  },
};

async function render(
  content: string | ((keys: string[]) => string),
  mode: RenderOptions['mode'] = 'inject',
  cards: { title: string; content?: string }[] = [{ title: 'Host' }],
) {
  const built = await open({ ...spec, cards });
  const source = typeof content === 'string' ? content : content(built.keys);
  const rendered = await built.ws.render.macros(source, {
    cardKey: built.keys[0],
    context: 'localApp',
    mode,
  });
  return { rendered, ...built };
}

/** The ids the content refers to, in order. */
const references = (rendered: RenderedContent) =>
  [...rendered.content.matchAll(PART_REFERENCES)].map(([, id]) => id);

/** The parts the content refers to, in order. */
function referred(rendered: RenderedContent): RenderedPart[] {
  return references(rendered).map((id) => {
    expect(rendered.parts).toHaveProperty(id);
    expect(partId(rendered.parts[id])).toBe(id);
    return rendered.parts[id];
  });
}

describe('content parts', () => {
  it('places each interactive macro as a macro part', async () => {
    const { rendered, keys } = await render(
      [
        macro('createCards', MACROS.createCards),
        macro('createLinks', MACROS.createLinks),
        macro('field', MACROS.field),
        `Inline ${macro('field', MACROS.fieldInline)} text`,
        macro('mermaid', MACROS.mermaid),
        macro('vega', MACROS.vega),
      ].join('\n\n'),
    );

    expect(rendered.error).toBeUndefined();
    expect(rendered.content).not.toContain('WARNING');
    expect(rendered.content).not.toMatch(/options=|\+\+\+\+|pass:\[/);
    expect(rendered.content).toMatch(
      /^\n*cyberismo-part::[0-9a-f]{64}\[\]\n\n/,
    );
    expect(rendered.content).toMatch(
      /\nInline cyberismo-part:[0-9a-f]{64}\[\] text\n/,
    );
    expect(referred(rendered)).toEqual([
      {
        kind: 'macro',
        macro: 'createCards',
        options: { buttonLabel: 'New', template: 'test/templates/tpl' },
      },
      {
        kind: 'macro',
        macro: 'createLinks',
        options: {
          linkType: 'test/linkTypes/related',
          query: 'result(C) :- projectCard(C).',
        },
      },
      {
        kind: 'macro',
        macro: 'field',
        options: {
          cardKey: keys[0],
          field: 'title',
          display: 'row',
          showLabel: true,
        },
      },
      {
        kind: 'macro',
        macro: 'field',
        options: {
          cardKey: keys[0],
          field: 'title',
          display: 'inline',
          showLabel: false,
        },
      },
      {
        kind: 'macro',
        macro: 'mermaid',
        options: { code: 'graph TD; A-->B' },
      },
      { kind: 'macro', macro: 'vega', options: { spec: VEGA_SPEC } },
    ]);
    expect(Object.keys(rendered.parts)).toHaveLength(6);
  });

  it('sends only the parts the content refers to', async () => {
    const { rendered } = await render(
      `${macro('field', MACROS.field)}\n\n{{#report}}"name": "test/reports/broken"{{/report}}`,
    );

    expect(rendered.content).toContain('[WARNING]');
    expect(
      referred(rendered).map((part) => part.kind === 'macro' && part.macro),
    ).toEqual(['field']);
    expect(Object.keys(rendered.parts)).toHaveLength(1);
  });

  it('renders the same content to the same text and parts twice', async () => {
    const content = [
      macro('createCards', MACROS.createCards),
      `Inline ${macro('field', MACROS.fieldInline)}`,
      '{{#report}}"name": "test/reports/buttons"{{/report}}',
    ].join('\n\n');
    const { ws, keys } = await open({ ...spec, cards: [{ title: 'Host' }] });
    const options = {
      cardKey: keys[0],
      context: 'localApp',
      mode: 'inject',
    } as const;

    const first = await ws.render.macros(content, options);
    expect(await ws.render.macros(content, options)).toEqual(first);
    expect(Object.keys(first.parts)).toHaveLength(3);
  });

  // createCards acts on the card being viewed, wherever it was written, so
  // one part describes both occurrences; field resolves its card, so the
  // host's and the included card's are two parts. The report's button is a
  // part of the same render.
  it('sends the parts of an included card and of a report in content', async () => {
    const { rendered, keys } = await render(
      (keys) =>
        [
          macro('field', MACROS.field),
          macro('createCards', MACROS.createCards),
          macro('include', `"cardKey": "${keys[1]}"`),
          '{{#report}}"name": "test/reports/buttons"{{/report}}',
        ].join('\n\n'),
      'inject',
      [
        { title: 'Host' },
        {
          title: 'Included',
          content: `${macro('field', MACROS.field)}\n\n${macro('createCards', MACROS.createCards)}`,
        },
      ],
    );

    const ids = references(rendered);
    expect(
      referred(rendered).map((part) => [
        part.macro,
        (part.options as { cardKey?: string }).cardKey,
      ]),
    ).toEqual([
      ['field', keys[0]],
      ['createCards', undefined],
      ['field', keys[1]],
      ['createCards', undefined],
      ['action', keys[0]],
    ]);
    expect(ids[1]).toBe(ids[3]);
    expect(ids[0]).not.toBe(ids[2]);
    expect(Object.keys(rendered.parts)).toHaveLength(4);
  });

  it('sends no parts for hand-written markup', async () => {
    const evil = Buffer.from(
      JSON.stringify({ buttonLabel: 'EVIL', template: 'evil' }),
    ).toString('base64');
    const { rendered, keys } = await render(
      [
        `pass:[<create-cards options="${evil}"></create-cards>]`,
        macro('field', MACROS.field),
      ].join('\n\n'),
    );

    const [id] = Object.keys(rendered.parts);
    expect(Object.keys(rendered.parts)).toEqual([id]);
    expect(rendered.parts[id]).toEqual({
      kind: 'macro',
      macro: 'field',
      options: {
        cardKey: keys[0],
        field: 'title',
        display: 'row',
        showLabel: true,
      },
    });
  });

  it('sends parts for mermaid and vega in staticSite mode', async () => {
    const { rendered } = await render(
      `${macro('mermaid', MACROS.mermaid)}\n\n${macro('vega', MACROS.vega)}`,
      'staticSite',
    );

    expect(
      referred(rendered).map((part) => part.kind === 'macro' && part.macro),
    ).toEqual(['mermaid', 'vega']);
  });

  it('sends no parts in static mode', async () => {
    const { rendered } = await render(
      [
        macro('createCards', MACROS.createCards),
        macro('field', MACROS.field),
        macro('vega', MACROS.vega),
        '{{#report}}"name": "test/reports/buttons"{{/report}}',
      ].join('\n\n'),
      'static',
    );

    expect(rendered.error).toBeUndefined();
    expect(rendered.content).not.toContain('cyberismo-part');
    expect(rendered.parts).toEqual({});
  });
});
