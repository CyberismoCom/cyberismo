// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { convert } from '@asciidoctor/core';
import { describe, expect, it } from 'vitest';

import { PART_ID_PATTERN } from '../src/interfaces/parts.js';
import { partReferences } from '../src/parts/references.js';

const ID = '0f1e2d3c4b5a6978'.repeat(4);

// What a reference turns into here: a marker that names the form and the id.
const references = partReferences({
  block: (id) => `<div class="block-part">${id}</div>`,
  inline: (id) => `<span class="inline-part">${id}</span>`,
});

async function html(adoc: string, withExtension = true) {
  return String(
    await convert(adoc, {
      safe: 'secure',
      ...(withExtension ? { extension_registry: references } : {}),
    }),
  );
}

describe('PART_ID_PATTERN', () => {
  it('accepts 64 lowercase hex characters', () => {
    expect(PART_ID_PATTERN.test('0123456789abcdef'.repeat(4))).toBe(true);
  });

  it.each([
    ['63 characters', 'a'.repeat(63)],
    ['65 characters', 'a'.repeat(65)],
    ['uppercase', 'A'.repeat(64)],
    ['non-hex', 'g'.repeat(64)],
    ['a trailing newline', `${'a'.repeat(64)}\n`],
    ['empty', ''],
  ])('rejects %s', (_, id) => {
    expect(PART_ID_PATTERN.test(id)).toBe(false);
  });
});

describe('partReferences', () => {
  it('the hyphenated name works for block and inline references', async () => {
    const out = await html(
      `Inline cyberismo-part:${ID}[] text\n\ncyberismo-part::${ID}[]`,
    );
    expect(out).toContain(
      `<p>Inline <span class="inline-part">${ID}</span> text</p>`,
    );
    expect(out).toContain(`<div class="block-part">${ID}</div>`);
  });

  it('a block reference that is not on its own line is inline text', async () => {
    const out = await html(`Click cyberismo-part::${ID}[] now`);
    expect(out).toContain(`Click cyberismo-part::${ID}[] now`);
    expect(out).not.toContain('-part">');
  });

  it.each([
    { row: 'a target that is not an id', adoc: 'cyberismo-part:x[]' },
    {
      row: 'a target of 63 hex characters',
      adoc: `cyberismo-part:${'a'.repeat(63)}[]`,
    },
    { row: 'an id with bracket text', adoc: `cyberismo-part:${ID}[label]` },
    {
      row: 'an id with an escaped bracket in the text',
      adoc: `cyberismo-part:${ID}[a\\]b]`,
    },
    { row: 'monospace, not an id', adoc: '`cyberismo-part:x[]`' },
    {
      row: 'monospace, an id with bracket text',
      adoc: `\`cyberismo-part:${ID}[label]\``,
    },
    {
      row: 'monospace, an id with an escaped bracket',
      adoc: `\`cyberismo-part:${ID}[a\\]b]\``,
    },
    {
      row: 'a URL (still a link)',
      adoc: 'https://example.com/cyberismo-part:x[label]',
    },
    {
      row: 'the block form mid-paragraph',
      adoc: `x cyberismo-part::${ID}[] y`,
    },
    { row: 'a block line, not an id', adoc: 'cyberismo-part::not-an-id[]' },
    {
      row: 'a block line with bracket text',
      adoc: 'cyberismo-part::not-an-id[text here]',
    },
    {
      row: 'a block line with an id and bracket text, title and role',
      adoc: `.Title\n[role=r]\ncyberismo-part::${ID}[text *here*]`,
    },
    {
      row: 'a target trying to break out of an attribute',
      adoc: `cyberismo-part:${ID}"onclick="alert(1)[]\n\ncyberismo-part::x"><img src=x onerror=alert(1)>[]`,
    },
    {
      row: 'cyberismo:///project in a table',
      adoc: '|===\n|cyberismo:///project |b\n|===',
    },
  ])(
    'shows anything that is not a reference exactly as without the extension: $row',
    async ({ adoc }) => {
      expect(await html(adoc)).toBe(await html(adoc, false));
    },
  );

  it('spaces at the bracket edges are trimmed (the known difference)', async () => {
    const adoc = `cyberismo-part:${ID}[ a ]`;
    expect(await html(adoc, false)).toContain(`cyberismo-part:${ID}[ a ]`);
    expect(await html(adoc)).toContain(`cyberismo-part:${ID}[a]`);
  });

  it('registers nothing globally and survives repeated conversions', async () => {
    // A conversion without the registry leaves the reference as text.
    expect(await html(`cyberismo-part:${ID}[]`, false)).toContain(
      `cyberismo-part:${ID}[]`,
    );
    for (let i = 0; i < 3; i++) {
      expect(await html(`Run ${i} cyberismo-part:${ID}[]`)).toContain(
        `<span class="inline-part">${ID}</span>`,
      );
    }
  });
});
