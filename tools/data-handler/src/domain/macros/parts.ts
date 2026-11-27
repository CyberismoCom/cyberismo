// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from 'node:crypto';

import type { RenderedPart } from '@cyberismo/model';

/**
 * The id of a part: the SHA-256 of its JSON, in lowercase hex. Everything that
 * changes what a part does is in the part, so two parts that behave
 * differently never share an id.
 */
export function partId(part: RenderedPart): string {
  return createHash('sha256').update(JSON.stringify(part)).digest('hex');
}
