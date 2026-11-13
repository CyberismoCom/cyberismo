// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { toCreateLinksOptions } from '@/components/macro-editors/create-links';

describe('toCreateLinksOptions', () => {
  const form = {
    linkType: 'm/linkTypes/l',
    direction: 'inbound' as const,
    linkDescription: ' why ',
    buttonLabel: ' Pick ',
    query: 'q',
  };

  it.each([
    [
      'keeps the direction and trims the optional fields',
      form,
      true,
      {
        linkType: 'm/linkTypes/l',
        direction: 'inbound',
        linkDescription: 'why',
        buttonLabel: 'Pick',
        query: 'q',
      },
    ],
    [
      'drops a description the link type does not take',
      form,
      false,
      {
        linkType: 'm/linkTypes/l',
        direction: 'inbound',
        buttonLabel: 'Pick',
        query: 'q',
      },
    ],
    [
      'leaves out blank optional fields',
      { ...form, linkDescription: ' ', buttonLabel: ' ' },
      true,
      { linkType: 'm/linkTypes/l', direction: 'inbound', query: 'q' },
    ],
  ])('%s', (_, data, allowsDescription, expected) => {
    expect(toCreateLinksOptions(data, allowsDescription)).toEqual(expected);
  });
});
