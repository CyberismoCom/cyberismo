/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { CardMetadataUpdater } from './card-metadata-updater.js';
import { getChildLogger } from './utils/log-utils.js';
import type { Project } from './containers/project.js';
import type { ExecuteTransition, UpdateField } from './types/queries.js';

const logger = getChildLogger({ module: 'sideEffects' });

/**
 * Side effects of one workflow transition or card creation, as returned by
 * the onTransition / onCreation hook queries.
 */
export interface SideEffects {
  updateFields?: UpdateField[];
  executeTransition?: ExecuteTransition[];
}

/**
 * Performs a single workflow transition without cascading and returns its
 * side effects. Throws if the transition cannot be performed.
 */
export type PerformTransition = (
  cardKey: string,
  transitionName: string,
) => Promise<SideEffects | undefined>;

/**
 * Executes hook-query side effects: applies field updates and performs
 * side-effect transitions breadth-first, feeding each performed transition's
 * own side effects back into the queue.
 *
 * Termination: `visited` holds `"cardKey:transitionName"` pairs already
 * attempted in this cascade (callers seed it with the primary transition).
 * A repeated pair is skipped, so cyclic module definitions degrade to a
 * logged no-op instead of looping.
 *
 * A side effect that cannot be performed is skipped with a warning; the
 * rest of the queue still runs.
 */
export async function applySideEffects(
  project: Project,
  initial: SideEffects | undefined,
  visited: Set<string>,
  performTransition: PerformTransition,
): Promise<void> {
  const queue: ExecuteTransition[] = [];

  const consume = async (effects: SideEffects | undefined) => {
    if (!effects) {
      return;
    }
    if (effects.updateFields?.length) {
      await CardMetadataUpdater.apply(project, effects.updateFields);
    }
    queue.push(...(effects.executeTransition ?? []));
  };

  await consume(initial);
  while (queue.length > 0) {
    const next = queue.shift()!;
    const key = `${next.card}:${next.transitionToExecute}`;
    if (visited.has(key)) {
      logger.warn(
        { cardKey: next.card, transition: next.transitionToExecute },
        'Skipping repeated side-effect transition; check module calculations for cycles',
      );
      continue;
    }
    visited.add(key);
    try {
      await consume(
        await performTransition(next.card, next.transitionToExecute),
      );
    } catch (error) {
      logger.warn(
        {
          cardKey: next.card,
          transition: next.transitionToExecute,
          error: error instanceof Error ? error.message : String(error),
        },
        'Side-effect transition skipped',
      );
    }
  }
}
