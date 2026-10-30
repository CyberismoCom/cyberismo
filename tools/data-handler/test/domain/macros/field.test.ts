// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import { convert } from '@asciidoctor/core';

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
  ],
  calculations: {
    calc: 'fieldCalculated(Card, "test/fieldTypes/calc", "auto") :- projectCard(Card).\n',
  },
  cards: [
    {
      title: 'Host',
      fields: { [TEXT]: 'host text', 'test/fieldTypes/level': 'high' },
    },
    { title: 'Included', fields: { 'test/fieldTypes/calc': 'manual' } },
  ],
};

const macro = (options: string) => `{{#field}}${options}{{/field}}`;

// Renders `content` on the host card, its text field set to `text` if given.
async function render(
  content: string,
  mode: RenderOptions['mode'],
  text?: (keys: string[]) => string,
) {
  const { ws, keys } = await open(spec);
  if (text) await ws.cards.editField(keys[0], TEXT, text(keys));
  const { content: out } = await ws.render.macros(content, {
    cardKey: keys[0],
    context: 'localApp',
    mode,
  });
  return { out, keys };
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
      'use the full field name `<module>/fieldTypes/pass:[text]`',
    ],
    [
      'an unknown field',
      '"field": "test/fieldTypes/nope"',
      "unknown field 'pass:[test/fieldTypes/nope]'",
    ],
    [
      'a field not on the card type',
      '"field": "test/fieldTypes/other"',
      "field 'test/fieldTypes/other' is not a field of card type 'test/cardTypes/page'",
    ],
  ])('reports %s as a macro error', async (_, options, message) => {
    const { out } = await render(macro(options), 'inject');

    expect(out).toContain('Macro Error');
    expect(out).toContain(message);
  });

  it('echoes a bad field name without closing the error block or planting a macro', async () => {
    const { ws, keys } = await open(spec);
    // JSON escapes, so the name holds braces and a newline only once parsed
    const name = `\\n====\\n\\u007b\\u007b#include\\u007d\\u007d\\"cardKey\\": \\"${keys[1]}\\"\\u007b\\u007b/include\\u007d\\u007d`;

    const { content } = await ws.render.macros(macro(`"field": "${name}"`), {
      cardKey: keys[0],
      context: 'localApp',
      mode: 'inject',
    });

    expect(content).not.toContain('Included');
    expect(content.split('\n').filter((line) => line === '====')).toHaveLength(
      2,
    );
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

  it('emits a placeholder carrying the card, field and label choice', async () => {
    const { out, keys } = await render(macro(`"field": "${TEXT}"`), 'inject');

    const options = out.match(
      /<card-field options="([^"]+)"><\/card-field>/,
    )?.[1];
    expect(JSON.parse(Buffer.from(options!, 'base64').toString())).toEqual({
      cardKey: keys[0],
      field: TEXT,
      showLabel: true,
    });
  });

  it.each([
    ['title', '"field": "title"', 'pass:[<strong>Title</strong>]: pass:[Host]'],
    [
      'workflowState',
      '"field": "workflowState"',
      'pass:[<strong>Workflow state</strong>]: pass:[Open]',
    ],
    [
      'a field in no visibility list',
      `"field": "${TEXT}"`,
      'pass:[<strong>text</strong>]: pass:[host text]',
    ],
    [
      'an enum without its label',
      '"field": "test/fieldTypes/level", "showLabel": false',
      'pass:[high]',
    ],
    [
      'a calculated field',
      '"field": "test/fieldTypes/calc", "showLabel": false',
      'pass:[auto]',
    ],
  ])('renders %s as text in static mode', async (_, options, expected) => {
    const { out } = await render(macro(options), 'static');

    expect(out).toBe(expected);
  });

  it.each([
    ['right after a word', 'a', '', 'a<strong>Title</strong>: Host'],
    [
      'inside an author bold',
      '**bold ',
      ' text**',
      '<strong>bold <strong>Title</strong>: Host text</strong>',
    ],
  ])('bolds the label %s', async (_, before, after, html) => {
    const { out } = await render(
      `${before}${macro('"field": "title"')}${after}`,
      'static',
    );

    expect(String(await convert(out))).toContain(html);
  });

  it('renders an overridden calculated field as the override', async () => {
    const { ws, keys } = await open(spec);

    const { content } = await ws.render.macros(
      macro('"field": "test/fieldTypes/calc", "showLabel": false'),
      { cardKey: keys[1], context: 'localApp', mode: 'static' },
    );

    expect(content).toBe('pass:[manual]');
  });

  it('renders text and no placeholder on the static site', async () => {
    const { out } = await render(macro(`"field": "${TEXT}"`), 'staticSite');

    expect(out).not.toContain('<card-field');
    expect(out).toContain('pass:[host text]');
  });

  it('targets the included card inside an include', async () => {
    const { ws, keys } = await open(spec);
    await ws.cards.edit(keys[1], macro('"field": "title"'));

    const { content } = await ws.render.macros(
      `{{#include}}"cardKey": "${keys[1]}", "title": "exclude"{{/include}}`,
      { cardKey: keys[0], context: 'localApp', mode: 'static' },
    );

    expect(content.trim()).toBe(
      'pass:[<strong>Title</strong>]: pass:[Included]',
    );
  });

  it('checks the card exists before running its query', async () => {
    const { ws } = await open(spec);
    const runQuery = vi.spyOn(CalculationEngine.prototype, 'runQuery');

    const { content } = await ws.render.macros(macro('"field": "title"'), {
      cardKey: 'test_nosuch',
      context: 'localApp',
      mode: 'static',
    });

    expect(content).toContain("Card 'test_nosuch' does not exist");
    expect(runQuery).not.toHaveBeenCalled();
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

  describe('static value escaping', () => {
    it.each([
      {
        name: 'a macro',
        value: '{{#include}}"cardKey": "INCLUDED"{{/include}}',
      },
      { name: 'bold markup', value: '*bold* _it_' },
      { name: 'html', value: '<script>alert(1)</script> &amp;' },
      { name: 'a closing bracket', value: 'a] *b*' },
      { name: 'a backslash ending a line', value: 'a\\\nb' },
      { name: 'a blank line and a directive', value: 'one\n\ninclude::x[]' },
      {
        name: 'passthrough delimiters the text before opened',
        before: 'x ++ $$ ',
        value: 'a ++ $$ *b*',
      },
    ])('renders $name literally', async ({ before = '', value }) => {
      const text = (keys: string[]) => value.replace('INCLUDED', keys[1]);
      const { out, keys } = await render(
        `${before}${macro(`"field": "${TEXT}", "showLabel": false`)}`,
        'static',
        text,
      );

      expect(out).not.toContain('Included');
      expect(await paragraphText(out)).toBe(before + text(keys));
    });

    const attack = `" onerror="alert(1)" x="'`;

    it.each([
      { name: 'an image alt text', attrs: 'x.png[', want: ['src', 'alt'] },
      {
        name: 'an image title',
        attrs: 'x.png[a,title=',
        want: ['src', 'alt', 'title'],
      },
    ])('keeps the value inside $name', async ({ attrs, want }) => {
      const { out } = await render(
        `image:${attrs}${macro(`"field": "${TEXT}", "showLabel": false`)}]`,
        'static',
        () => attack,
      );

      const html = String(await convert(out, { safe: 'secure' }));
      const img = html.match(/<img ([^>]*)>/)![1];
      expect([...img.matchAll(/([\w-]+)="/g)].map((m) => m[1])).toEqual(want);
    });

    it('keeps the value inside a nested table cell', async () => {
      const { out } = await render(
        `|===\na|\n!===\n!${macro(`"field": "${TEXT}", "showLabel": false`)}\n!===\n|===`,
        'static',
        () => 'a ! b',
      );

      const html = String(await convert(out, { safe: 'secure' }));
      expect(html.match(/<td/g)).toHaveLength(2);
      expect(html).toContain('<p class="tableblock">a &#33; b</p>');
    });
  });
});
