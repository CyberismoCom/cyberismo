// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from 'node:crypto';

import { PART_REFERENCE } from '@cyberismo/model';
import type { MacroMetadata, MacroName, RenderedPart } from '@cyberismo/model';

import type { MacroGenerationContext } from '../../shared/interfaces/macros.js';

/**
 * The id of a part: the SHA-256 of its JSON, in lowercase hex. Everything that
 * changes what a part does is in the part, so two parts that behave
 * differently never share an id.
 */
export function partId(part: RenderedPart): string {
  return createHash('sha256').update(JSON.stringify(part)).digest('hex');
}

/**
 * Records an interactive macro as a part of the render and returns the
 * reference to it: a block reference on its own line, or an inline one inside
 * its paragraph or table cell. An id names a part the server made; it is not
 * a secret.
 */
export function placeMacro(
  context: Pick<MacroGenerationContext, 'parts'>,
  macro: MacroMetadata,
  options: object,
  display: 'block' | 'inline' = 'block',
): string {
  const part: RenderedPart = {
    kind: 'macro',
    macro: macro.name as MacroName,
    options: options as Record<string, unknown>,
  };
  const id = partId(part);
  context.parts?.set(id, part);
  return display === 'block'
    ? `\n\n${PART_REFERENCE}::${id}[]\n\n`
    : `${PART_REFERENCE}:${id}[]`;
}
