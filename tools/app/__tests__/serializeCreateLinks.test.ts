// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { serializeCreateLinks } from '@/lib/codemirror/actions';

describe('serializeCreateLinks', () => {
  it('puts the query in a quoted block after the other options', () => {
    expect(
      serializeCreateLinks({
        linkType: 'm/linkTypes/l',
        direction: 'inbound',
        buttonLabel: 'Pick',
        query: 'result(X) :- projectCard(X).\nselect(1, "results", "title").\n',
      }),
    ).toBe(`{{#createLinks}}
  "linkType": "m/linkTypes/l",
  "direction": "inbound",
  "buttonLabel": "Pick",
  "query": {{#quoted}}
result(X) :- projectCard(X).
select(1, "results", "title").
{{/quoted}}
{{/createLinks}}`);
  });
});
