// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Workspace } from '@cyberismo/data-handler';

/**
 * Returns all unique labels available in the project.
 * @param ws command manager used for the query
 * @returns a list of labels
 */
export async function getLabels(ws: Workspace): Promise<string[]> {
  return (await ws.cards.labels()).sort();
}
