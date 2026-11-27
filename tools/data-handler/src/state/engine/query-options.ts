// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from 'zod';

import type { QueryName } from '@cyberismo/model';
import { DHValidationError } from '../../shared/exceptions/index.js';

// Card keys are pasted into the query's logic program unquoted. A key as
// the project makes them (prefix, separator, base-36 suffix) is a plain
// constant there and cannot change the program. Whether the project holds
// the card is not checked.
const cardKey = z
  .string()
  .regex(/^[a-z]+_[a-z0-9]+$/, { error: 'Not a valid card key' });

/** The inputs each predefined query takes, as its template uses them. */
export const queryOptions = {
  card: z.strictObject({
    cardKey: cardKey
      .optional()
      .describe('Only this card; without cardKey and cardKeys, every card'),
    cardKeys: z.array(cardKey).optional().describe('Only these cards'),
  }),
  connectors: z.strictObject({}),
  enabledSkills: z.strictObject({
    cardKey: cardKey
      .optional()
      .describe(
        'Skills enabled for this card; without it, project-wide skills',
      ),
  }),
  tree: z.strictObject({
    cardKey: cardKey
      .optional()
      .describe('Only the tree under this card; without it, the whole project'),
    recursive: z
      .boolean()
      .optional()
      .describe("With cardKey: include the card's descendants"),
  }),
} satisfies Record<QueryName, z.ZodType>;

/** The inputs of a predefined query. */
export type QueryOptions<T extends QueryName> = z.input<
  (typeof queryOptions)[T]
>;

/**
 * Checks the inputs of a predefined query.
 * @throws DHValidationError if they do not fit the query.
 */
export function parseQueryOptions<T extends QueryName>(
  queryName: T,
  options: unknown,
): QueryOptions<T> {
  const result = queryOptions[queryName].safeParse(options ?? {});
  if (!result.success) {
    throw new DHValidationError(
      `Invalid options for query '${queryName}': ${z.prettifyError(result.error)}`,
    );
  }
  return result.data as QueryOptions<T>;
}
