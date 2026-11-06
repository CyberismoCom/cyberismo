// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import { convert } from '@asciidoctor/core';
import { JSDOM } from 'jsdom';

import type { RenderOptions } from '@cyberismo/model';
import { CalculationEngine } from '../../../src/state/engine/calculation-engine.js';
import { evaluateMacros } from '../../../src/domain/macros/registry.js';
import { checkoutOf } from '../../../src/state/checkout/internal.js';
import { projects } from '../cards/fixture.js';

const open = projects();

afterEach(() => {
  vi.restoreAllMocks();
});

const TEXT = 'test/fieldTypes/text';

const spec = {
  fieldTypes: [
    { name: 'text', dataType: 'longText' },
    { name: 'level', dataType: 'enum', enumValues: ['low', 'high'] },
    { name: 'calc', dataType: 'shortText' },
    { name: 'other', dataType: 'shortText' },
  ],
  cardTypes: [
    {
      name: 'page',
      customFields: [
        { name: 'text' },
        { name: 'level' },
        { name: 'calc', isCalculated: true, enableOverride: true },
      ],
      alwaysVisibleFields: ['level'],
    },
    { name: 'note', customFields: [{ name: 'other' }] },
  ],
  templates: [{ name: 'tpl', cards: [{ title: 'Template card' }] }],
  calculations: {
    calc: 'fieldCalculated(Card, "test/fieldTypes/calc", "auto") :- projectCard(Card).\n',
  },
  cards: [
    {
      title: 'Host',
      fields: { [TEXT]: 'host text', 'test/fieldTypes/level': 'high' },
    },
    { title: 'Included', fields: { 'test/fieldTypes/calc': 'manual' } },
    {
      title: 'Target',
      cardType: 'note',
      fields: { 'test/fieldTypes/other': 'target other' },
    },
  ],
};

const macro = (options: string) => `{{#field}}${options}{{/field}}`;

type Built = Awaited<ReturnType<typeof open>>;
const target = (b: Built) => b.keys[2];
const templateCard = (b: Built) => b.templateKeys['test/templates/tpl'][0];

// Renders `content` on card `host` (the first by default), its text field set to `text` if given.
async function render(
  content: string | ((built: Built) => string),
  mode: RenderOptions['mode'],
  text?: (keys: string[]) => string,
  host = 0,
) {
  const built = await open(spec);
  const { ws, keys } = built;
  if (text) await ws.cards.editField(keys[0], TEXT, text(keys));
  const source = typeof content === 'string' ? content : content(built);
  const { content: out } = await ws.render.macros(source, {
    cardKey: keys[host],
    context: 'localApp',
    mode,
  });
  return { out, keys, built };
}

// Text of the single paragraph Asciidoctor makes of `adoc`; null if it holds markup.
async function paragraphText(adoc: string) {
  const html = String(await convert(adoc, { safe: 'secure' }));
  const inner = html.match(/<p>([\s\S]*)<\/p>/)?.[1] ?? '';
  const text = inner.replaceAll('<br>\n', '\n');
  if (text.includes('<')) return null;
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&');
}

// Visible text of `adoc`.
async function plain(adoc: string) {
  const html = String(await convert(adoc, { safe: 'secure' }));
  return (JSDOM.fragment(html).textContent ?? '').trim();
}

describe('field macro', () => {
  it.each([
    [
      'a missing field',
      '"showLabel": true',
      "must have required property 'field'",
    ],
    [
      'a bare field name',
      '"field": "text"',
      'use the full field name `<module>/fieldTypes/text`',
    ],
    [
      'an unknown field',
      '"field": "test/fieldTypes/nope"',
      "unknown field 'test/fieldTypes/nope'",
    ],
    [
      'a field not on the card type',
      '"field": "test/fieldTypes/other"',
      "field 'test/fieldTypes/other' is not a field of card type 'test/cardTypes/page'",
    ],
    [
      'an unknown display',
      '"field": "title", "display": "box"',
      'must be equal to one of the allowed values',
    ],
    [
      'a showLabel that is not a boolean',
      '"field": "title", "showLabel": "false"',
      'must be boolean',
    ],
    [
      "a field on the host's card type but not the target's",
      (b: Built) => `"cardKey": "${target(b)}", "field": "${TEXT}"`,
      `field '${TEXT}' is not a field of card type 'test/cardTypes/note'`,
    ],
    [
      'a template card target',
      (b: Built) => `"cardKey": "${templateCard(b)}", "field": "title"`,
      'a field macro cannot target a template card',
    ],
  ])('reports %s as a macro error', async (_, options, message) => {
    const { out } = await render(
      (b) => macro(typeof options === 'string' ? options : options(b)),
      'inject',
    );

    expect(out).toContain('Macro Error');
    expect(out).toContain(message);
  });

  it('checks only the schema in validate mode', async () => {
    const { ws, keys } = await open(spec);
    const validate = (options: string) =>
      evaluateMacros(macro(options), {
        checkout: checkoutOf(ws),
        cardKey: keys[0],
        context: 'localApp',
        mode: 'validate',
      });

    await expect(validate('"field": "nope"')).resolves.toBe('');
    await expect(validate('"field": 1')).rejects.toThrow(
      /field macro JSON validation error: must be string/,
    );
  });

  it.each([
    {
      name: 'the host card, by default',
      cardKey: () => undefined,
      extra: '',
      want: (b: Built) => b.keys[0],
      display: 'row',
      showLabel: true,
    },
    {
      name: 'the host card, for row with the label off',
      cardKey: () => undefined,
      extra: ', "display": "row", "showLabel": false',
      want: (b: Built) => b.keys[0],
      display: 'row',
      showLabel: false,
    },
    {
      name: 'the host card, for inline',
      cardKey: () => undefined,
      extra: ', "display": "inline"',
      want: (b: Built) => b.keys[0],
      display: 'inline',
      showLabel: false,
    },
    {
      name: 'the host card, for inline with the label on',
      cardKey: () => undefined,
      extra: ', "display": "inline", "showLabel": true',
      want: (b: Built) => b.keys[0],
      display: 'inline',
      showLabel: true,
    },
    {
      name: 'a target card',
      cardKey: target,
      extra: '',
      want: target,
      display: 'row',
      showLabel: true,
    },
  ])(
    'emits a placeholder carrying the card, field, display and label for $name',
    async ({ cardKey, extra, want, display, showLabel }) => {
      const { out, built } = await render((b) => {
        const key = cardKey(b);
        return macro(
          `${key ? `"cardKey": "${key}", ` : ''}"field": "title"${extra}`,
        );
      }, 'inject');

      const options = out.match(
        /<card-field options="([^"]+)"><\/card-field>/,
      )?.[1];
      expect(JSON.parse(Buffer.from(options!, 'base64').toString())).toEqual({
        cardKey: want(built),
        field: 'title',
        showLabel,
        display,
      });
    },
  );

  it.each([
    [
      'row',
      '',
      /^before \n\n\+\+\+\+\n<card-field [^\n]*<\/card-field>\n\+\+\+\+\n\n after$/,
    ],
    [
      'inline',
      ', "display": "inline"',
      /^before pass:\[<card-field [^\n]*<\/card-field>\] after$/,
    ],
  ])('shapes a %s placeholder to fit its display', async (_, extra, shape) => {
    const { out } = await render(
      `before ${macro(`"field": "title"${extra}`)} after`,
      'inject',
    );

    expect(out).toMatch(shape);
  });

  it.each<[string, string | ((b: Built) => string), string, number?]>([
    ['title', '"field": "title"', 'Title: Host'],
    ['workflowState', '"field": "workflowState"', 'Workflow state: Open'],
    ['a field in no visibility list', `"field": "${TEXT}"`, 'text: host text'],
    [
      'an enum without its label',
      '"field": "test/fieldTypes/level", "showLabel": false',
      'high',
    ],
    [
      'a calculated field',
      '"field": "test/fieldTypes/calc", "showLabel": false',
      'auto',
    ],
    [
      'an overridden calculated field as the override',
      '"field": "test/fieldTypes/calc", "showLabel": false',
      'manual',
      1,
    ],
    [
      "another card's field",
      (b: Built) =>
        `"cardKey": "${target(b)}", "field": "test/fieldTypes/other", "showLabel": false`,
      'target other',
    ],
  ])(
    'renders %s as text in static mode',
    async (_, options, expected, host) => {
      const { out } = await render(
        (b) => macro(typeof options === 'string' ? options : options(b)),
        'static',
        undefined,
        host,
      );

      expect(await plain(out)).toBe(expected);
    },
  );

  it('makes each of consecutive row macros a paragraph of its own in static mode', async () => {
    const { out } = await render(
      `${macro('"field": "title"')}\n${macro('"field": "workflowState"')}`,
      'static',
    );

    const html = String(await convert(out, { safe: 'secure' }));
    expect(html.match(/<p>/g)).toHaveLength(2);
    expect(html).toContain('<p><strong>Title</strong>: Host</p>');
    expect(html).toContain('<p><strong>Workflow state</strong>: Open</p>');
  });

  it('bolds the label inside an author bold', async () => {
    const { out } = await render(
      `**bold ${macro('"field": "title", "display": "inline", "showLabel": true')} text**`,
      'static',
    );

    expect(String(await convert(out))).toContain(
      '<strong>bold <strong>Title</strong>: Host text</strong>',
    );
  });

  it('targets the included card inside an include', async () => {
    const { ws, keys } = await open(spec);
    await ws.cards.edit(keys[1], macro('"field": "title"'));

    const { content } = await ws.render.macros(
      `{{#include}}"cardKey": "${keys[1]}", "title": "exclude"{{/include}}`,
      { cardKey: keys[0], context: 'localApp', mode: 'static' },
    );

    expect(await plain(content)).toBe('Title: Included');
  });

  it.each([
    [
      'an unknown host',
      () => 'test_nosuch',
      '',
      "card 'test_nosuch' does not exist",
      0,
    ],
    [
      'an unknown target',
      (b: Built) => b.keys[0],
      '"cardKey": "test_nosuch", ',
      "card 'test_nosuch' does not exist",
      0,
    ],
  ])(
    'checks the card exists before running its query, given %s',
    async (_, host, cardKey, expected, queries) => {
      const built = await open(spec);
      const runQuery = vi.spyOn(CalculationEngine.prototype, 'runQuery');

      const { content } = await built.ws.render.macros(
        macro(`${cardKey}"field": "title", "showLabel": false`),
        { cardKey: host(built), context: 'localApp', mode: 'static' },
      );

      expect(content).toContain(expected);
      expect(runQuery).toHaveBeenCalledTimes(queries);
    },
  );

  it('allows a template target when there is no host card', async () => {
    const built = await open(spec);

    const { content } = await built.ws.render.macros(
      macro(
        `"cardKey": "${templateCard(built)}", "field": "title", "showLabel": false`,
      ),
      { cardKey: '', context: 'localApp', mode: 'static' },
    );

    expect(content).toContain('Template card');
  });

  it('runs the card query once for several macros on the card', async () => {
    const { ws, keys } = await open(spec);
    const runQuery = vi.spyOn(CalculationEngine.prototype, 'runQuery');

    await ws.render.macros(
      `${macro('"field": "title"')} ${macro(`"field": "${TEXT}"`)}`,
      {
        cardKey: keys[0],
        context: 'localApp',
        mode: 'static',
      },
    );

    expect(runQuery).toHaveBeenCalledTimes(1);
  });

  describe('nested in a report', () => {
    const reportSpec = (field: string) => ({
      ...spec,
      reports: {
        rows: {
          query: 'select("key").\nresult(C) :- projectCard(C).\n',
          content: `{{#each results}}{{#field}}${field}{{/field}}\n{{/each}}`,
        },
      },
    });
    const run = async (field: string, mode: RenderOptions['mode']) => {
      const { ws, keys } = await open(reportSpec(field));
      const { content } = await ws.render.macros(
        `{{#report}}"name": "test/reports/rows"{{/report}}`,
        { cardKey: keys[0], context: 'localApp', mode },
      );
      return { content, keys };
    };
    const rowKey = '"cardKey": "{{this.key}}", "field": "title"';

    it('gives each row its own card in inject mode', async () => {
      const { content, keys } = await run(rowKey, 'inject');

      const targets = [
        ...content.matchAll(/<card-field options="([^"]+)"><\/card-field>/g),
      ].map((m) => JSON.parse(Buffer.from(m[1], 'base64').toString()).cardKey);
      expect(targets.sort()).toEqual([...keys].sort());
    });

    it('shows each row card value in static mode', async () => {
      const { content } = await run(rowKey, 'static');

      for (const title of ['Host', 'Included', 'Target'])
        expect(content).toContain(title);
    });

    it('targets the card the report is on when cardKey is omitted', async () => {
      const { content } = await run('"field": "title"', 'static');

      expect(content.match(/Host/g)).toHaveLength(3);
    });
  });

  describe('static value text', () => {
    const inline = (extra = '') =>
      macro(
        `"field": "${TEXT}", "display": "inline", "showLabel": false${extra}`,
      );

    it('does not expand a macro written in a value', async () => {
      const text = (keys: string[]) =>
        `{{#include}}"cardKey": "${keys[1]}"{{/include}} and {{ stray`;
      const { out, keys } = await render(inline(), 'static', text);

      expect(out).not.toContain('Included');
      expect(await paragraphText(out)).toBe(text(keys));
    });
  });
});
