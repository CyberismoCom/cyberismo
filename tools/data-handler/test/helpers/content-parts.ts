// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { MacroName, RenderedContent } from '@cyberismo/model';

/** Every part reference in content, block or inline, as its id, in order. */
export const PART_REFERENCES = /cyberismo-part::?([0-9a-f]{64})\[\]/g;

/**
 * The options of the macro parts the content refers to, in content order;
 * only those of `macro` when it is given. A reference without its part fails.
 */
export function macroParts<T = Record<string, unknown>>(
  rendered: RenderedContent,
  macro?: MacroName,
): T[] {
  return [...rendered.content.matchAll(PART_REFERENCES)].flatMap(([, id]) => {
    const part = rendered.parts[id];
    if (!part) throw new Error(`No part for the reference '${id}'`);
    return part.kind === 'macro' && (!macro || part.macro === macro)
      ? [part.options as T]
      : [];
  });
}
