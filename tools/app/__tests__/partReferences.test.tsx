// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// Part references through the app's real Asciidoctor conversion
// (adocToHtml), DOMPurify and React mapping, with stub macro components.

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import { BrowserRouter } from 'react-router';
import type {
  Card,
  QueryResult,
  RenderedPart,
  RenderedParts,
} from '@cyberismo/model';

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), render: vi.fn() },
}));

// Each macro component shows which macro activated with which props.
vi.mock('@/components/macros', async () => {
  const stub =
    (name: string) =>
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ({ macroKey: _k, preview: _p, ...props }: Record<string, unknown>) => (
      <span data-macro={name}>{JSON.stringify(props)}</span>
    );
  return {
    macros: Object.fromEntries(
      [
        'action',
        'createCards',
        'createLinks',
        'field',
        'mermaid',
        'scoreCard',
        'vega',
      ].map((n) => [n, stub(n)]),
    ),
  };
});

import { renderCardHtml } from '@/components/card/renderCardContent';
import { toCardView } from '@/lib/api/card';
import { adocToHtml } from '@/lib/asciidoc';

// Ids as the server makes them: 64 lowercase hex characters.
const G = '796b7d921dbeb91d'.repeat(4); // a createCards (block)
const F = '0f1e2d3c4b5a6978'.repeat(4); // a field (inline)
const A = 'a1b2c3d4e5f60718'.repeat(4); // a report's action button (inline)
const MADE_UP = '0'.repeat(64);
const DATA: RenderedParts = {
  [G]: {
    kind: 'macro',
    macro: 'createCards',
    options: { buttonLabel: 'Genuine', template: 'm/templates/t' },
  },
  [F]: {
    kind: 'macro',
    macro: 'field',
    options: {
      cardKey: 'k_1',
      field: 'title',
      showLabel: false,
      display: 'inline',
    },
  },
  [A]: {
    kind: 'macro',
    macro: 'action',
    options: { buttonLabel: 'Run', cardKey: 'k_1', programs: [] },
  },
};
const EVIL = btoa(JSON.stringify({ buttonLabel: 'EVIL', template: 'evil' }));

type Activated = { name: string | null; props: Record<string, unknown> };

let n = 0;
async function view(adoc: string, parts: RenderedParts = DATA) {
  // Each call gets its own card key so the conversion cache never hides a run.
  const html = await adocToHtml(adoc, `k_${n++}`, 'p');
  return { html, ...show(html, parts) };
}

function show(html: string, parts: RenderedParts) {
  const { container, unmount } = render(
    <BrowserRouter>
      <div className="doc">
        {renderCardHtml(html, { macroKey: 'k_1', parts })}
      </div>
    </BrowserRouter>,
  );
  const activated: Activated[] = [
    ...container.querySelectorAll('[data-macro]'),
  ].map((e) => ({
    name: e.getAttribute('data-macro'),
    props: JSON.parse(e.textContent ?? '{}'),
  }));
  const text = container.textContent ?? '';
  unmount();
  return { activated, text };
}

/** The rule: every activation is exactly a part of the server's data. */
function expectOnlyServerParts(activated: Activated[]) {
  const entries = Object.values(DATA).map((p) => ({
    name: p.macro,
    props: p.options,
  }));
  for (const a of activated) {
    expect(entries).toContainEqual(a);
  }
}

const names = (a: Activated[]) => a.map((x) => x.name);

describe('part references', () => {
  it.each([
    {
      where: 'block reference on its own line',
      adoc: `Before\n\ncyberismo-part::${G}[]\n\nAfter`,
      expected: ['createCards'],
    },
    {
      where: 'inline reference mid-paragraph',
      adoc: `The title is cyberismo-part:${F}[] here.`,
      expected: ['field'],
    },
    {
      where: 'inline in a plain table cell',
      adoc: `|===\n|A |cyberismo-part:${F}[]\n|===`,
      expected: ['field'],
    },
    {
      where: 'block as the server emits it into a plain table cell',
      adoc: `|===\n|A |\n\ncyberismo-part::${G}[]\n\n|===`,
      expected: [],
    },
    {
      where: 'block as the server emits it into a list item',
      adoc: `* item \n\ncyberismo-part::${G}[]\n\n* other`,
      expected: ['createCards'],
    },
    {
      where: 'inline in a section title, with a TOC',
      adoc: `= Doc\n:toc:\n\n== Section cyberismo-part:${F}[]\n\nText`,
      expected: ['field'],
    },
  ])('places references: $where', async ({ adoc, expected }) => {
    const { activated } = await view(adoc);
    expect(names(activated)).toEqual(expected);
    expectOnlyServerParts(activated);
  });

  // Hostile surroundings around genuine references: every activation must be
  // a part of the data, whatever the content does around it.
  it.each([
    {
      row: 'hand-written block reference with a made-up id',
      adoc: `cyberismo-part::${MADE_UP}[]`,
      expected: [],
    },
    {
      row: 'hand-written inline reference with a made-up id',
      adoc: `Text cyberismo-part:${MADE_UP}[] text`,
      expected: [],
    },
    {
      row: 'hand-written part element with a made-up id',
      adoc: `++++\n<cyberismo-part data-part-id="${MADE_UP}"></cyberismo-part>\n++++`,
      expected: [],
    },
    {
      row: 'unfinished forged element with a made-up id merged with a genuine one',
      adoc: `pass:[<cyberismo-part data-part-id="${MADE_UP}" ]cyberismo-part:${F}[]pass:[>]`,
      expected: [],
    },
    {
      row: 'unfinished element without id grafts the genuine id',
      adoc: `pass:[<cyberismo-part ]cyberismo-part:${F}[]pass:[>]`,
      expected: ['field'],
    },
    {
      row: 'genuine id copied (repeats a part of this render)',
      adoc: `cyberismo-part::${G}[]\n\ncyberismo-part::${G}[]`,
      expected: ['createCards', 'createCards'],
    },
    {
      row: 'hand-written part element with genuine id plus extra attributes',
      adoc: `pass:[<cyberismo-part data-part-id="${G}" options="${EVIL}" data-button-label="EVIL" data-template="evil"></cyberismo-part>]`,
      expected: ['createCards'],
    },
    {
      row: 'triple-plus passthrough with genuine id and forged options',
      adoc: `+++<cyberismo-part data-part-id="${F}" options="${EVIL}"></cyberismo-part>+++`,
      expected: ['field'],
    },
    {
      row: 'attributes in the brackets make it text',
      adoc: `cyberismo-part:${F}[buttonLabel=EVIL,options=${EVIL}]`,
      expected: [],
    },
    {
      row: 'attributes in the brackets of an action reference make it text',
      adoc: `cyberismo-part:${A}[buttonLabel=EVIL]`,
      expected: [],
    },
  ])('hostile surroundings: $row', async ({ adoc, expected }) => {
    const { activated } = await view(adoc);
    expectOnlyServerParts(activated);
    expect(names(activated)).toEqual(expected);
  });

  it('renders nothing for an unknown kind', async () => {
    const { activated, text } = await view(
      `Before cyberismo-part:${F}[] after`,
      {
        // An unknown kind, even one that also looks like a macro part.
        [F]: {
          kind: 'html',
          html: '<b>x</b>',
          macro: 'field',
          options: DATA[F].options,
        } as unknown as RenderedPart,
      },
    );
    expect(activated).toEqual([]);
    expect(text).not.toContain('x');
    expect(text).toContain('Before  after');
  });

  it('renders nothing for a macro without a component', async () => {
    const { activated, text } = await view(
      `Before cyberismo-part:${F}[] after`,
      {
        [F]: {
          kind: 'macro',
          macro: 'graph',
          options: { model: 'm', view: 'v' },
        },
      },
    );
    expect(activated).toEqual([]);
    expect(text.trim()).toBe('Before  after');
  });

  it('same HTML, data decides', async () => {
    const adoc = `Cached cyberismo-part:${F}[]`;
    const first = await adocToHtml(adoc, 'same', 'p');
    expect(await adocToHtml(adoc, 'same', 'p')).toBe(first);
    expect(first).not.toContain('title');
    expect(show(first, DATA).activated).toHaveLength(1);
    expect(show(first, {}).activated).toHaveLength(0);
  });

  it('the card view carries the parts sent with the content', () => {
    const content = { adocContent: `cyberismo-part:${F}[]`, parts: DATA };
    const card = toCardView(
      { key: 'k_1', title: 't' } as QueryResult<'card'>,
      content,
      { content: '', attachments: [], path: '' } as unknown as Card,
    );
    expect(card?.parts).toBe(DATA);
  });
});
