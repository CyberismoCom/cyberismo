/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { Project } from '../containers/project.js';
import { write } from '../utils/rw-lock.js';

/**
 * Handles transitions.
 */
export class Transition {
  /**
   * Creates an instance of Transition command.
   * @param project Project to use.
   */
  constructor(private project: Project) {}

  /**
   * Transitions a card from its current state to a new state, then executes
   * any side effects modules have declared for the transition.
   * @param cardKey card key
   * @param transitionName name of the transition to do
   */
  @write((cardKey) => `Transition card ${cardKey}`)
  public async cardTransition(cardKey: string, transitionName: string) {
    const effects = await this.project.performTransition(
      cardKey,
      transitionName,
    );
    await this.project.executeSideEffects(
      effects,
      new Set([`${cardKey}:${transitionName}`]),
    );
  }
}
