// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { BaseResult, LinkCandidate } from '@cyberismo/model';

const isString = (value: unknown): value is string => typeof value === 'string';

/**
 * Maps query rows to link candidates: card rows have a `cardType`, external
 * rows a `connector` and `itemKey`. Other rows and repeated keys are dropped;
 * order is kept.
 */
export function toLinkCandidates(results: BaseResult[]): LinkCandidate[] {
  const candidates: LinkCandidate[] = [];
  const seen = new Set<string>();
  for (const row of results) {
    const { connector, itemKey, cardType, title } = row;
    let candidate: LinkCandidate | undefined;
    if (isString(connector) && isString(itemKey)) {
      const key = `${connector}:${itemKey}`;
      candidate = {
        key,
        kind: 'external',
        title: (isString(title) && title) || key,
        connector,
        itemKey,
      };
    } else if (isString(cardType)) {
      candidate = {
        key: row.key,
        kind: 'card',
        title: (isString(title) && title) || row.key,
        cardType,
      };
    }
    if (!candidate || seen.has(candidate.key)) continue;
    seen.add(candidate.key);
    candidates.push(candidate);
  }
  return candidates;
}
