// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Registry } from '@asciidoctor/core';
import {
  PART_REFERENCE,
  type RenderedPart,
  type RenderedParts,
} from '@cyberismo/model';
import { partReferences } from '@cyberismo/model/parts/references';

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** The source text of a part, for an agent to read; empty for an unknown kind. */
function partSource(part: RenderedPart): string {
  switch (part.kind) {
    case 'macro': {
      const body = JSON.stringify(part.options).slice(1, -1);
      return `{{#${part.macro}}}${body}{{/${part.macro}}}`;
    }
    default: {
      // Every kind has a case: a new kind fails the build here. At run time
      // a kind this code does not know shows nothing.
      const unknown: never = part.kind;
      void unknown;
      return '';
    }
  }
}

/** The HTML that shows a part as its source; empty if the id names none. */
function partHtml(
  parts: RenderedParts,
  id: string,
  element: 'code' | 'pre',
): string {
  if (!Object.hasOwn(parts, id)) return '';
  const part = parts[id];
  const source = partSource(part);
  return source
    ? `<${element} class="${PART_REFERENCE}" data-kind="${part.kind}">${escapeHtml(source)}</${element}>`
    : '';
}

/**
 * Asciidoctor extensions, for one render, that show each part reference as
 * the source of its part: inline in `code`, as a block in `pre`. An unknown
 * id or kind shows nothing.
 */
export function resolvingParts(parts: RenderedParts): Registry {
  return partReferences({
    block: (id) => partHtml(parts, id, 'pre'),
    inline: (id) => partHtml(parts, id, 'code'),
  });
}
