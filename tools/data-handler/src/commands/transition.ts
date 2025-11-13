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

import { ActionGuard } from '../permissions/action-guard.js';
import { CardMetadataUpdater } from '../card-metadata-updater.js';
import type { Project } from '../containers/project.js';
import type { WorkflowState } from '../interfaces/resource-interfaces.js';

/**
 * Handles transitions.
 */
export class Transition {
  /**
   * Creates an instance of Transition command.
   * @param project Project to use.
   */
  constructor(private project: Project) {}

  // Wrapper to run onTransition query.
  private async transitionChangesQuery(cardKey: string, transition: string) {
    if (!cardKey || !transition) return undefined;
    return this.project.calculationEngine.runQuery('onTransition', 'localApp', {
      cardKey,
      transition,
    });
  }

  /**
   * Transitions a card from its current state to a new state.
   * @param cardKey card key
   * @param transition which transition to do
   */
  public async cardTransition(cardKey: string, transition: WorkflowState) {
    const card = this.project.findCard(cardKey);

    if (!card.metadata?.cardType) {
      throw new Error(`Card does not have card type`);
    }
    // Card type
    const cardType = await this.project.resources
      .byType(card.metadata?.cardType, 'cardTypes')
      .show();

    // Workflow
    const workflow = await this.project.resources
      .byType(cardType.workflow, 'workflows')
      .show();

    // Check that the state transition can be made "from".
    const foundFrom = workflow.transitions.find(
      (item) =>
        (card.metadata &&
          item.fromState.includes(card.metadata?.workflowState)) ||
        item.fromState.includes('*'),
    );
    if (!foundFrom) {
      throw new Error(
        `Card's workflow '${cardType.workflow}' does not contain transition from card's current state '${card.metadata?.workflowState}'`,
      );
    }

    // Check that the state transition can be made "to".
    const found = workflow.transitions.find(
      (item) => item.name === transition.name,
    );
    if (!found) {
      const transitionNames = workflow.transitions.map((item) => item.name);
      throw new Error(`Card's workflow '${cardType.workflow}' does not contain state transition '${transition.name}'.
                          \nThe available transitions are: ${transitionNames.join(', ')}`);
    }

    if (
      !(
        (card.metadata?.workflowState &&
          found.fromState.includes(card.metadata.workflowState)) ||
        found.fromState.includes('*')
      )
    ) {
      throw new Error(
        `Card's workflow '${cardType.workflow}' does not contain state transition from state '${card.metadata?.workflowState}' for '${transition.name}`,
      );
    }

    const actionGuard = new ActionGuard(this.project.calculationEngine);
    await actionGuard.checkPermission('transition', cardKey, transition.name);

    if (card.metadata) {
      card.metadata.workflowState = found.toState;
      card.metadata.lastUpdated = new Date().toISOString();
      card.metadata.lastTransitioned = new Date().toISOString();
      return this.project
        .updateCardMetadata(card, card.metadata)
        .then(async () => this.transitionChangesQuery(cardKey, transition.name))
        .then(async (queryResult) => {
          if (
            !queryResult ||
            queryResult.at(0) === undefined ||
            queryResult.at(0)?.updateFields === undefined
          ) {
            return;
          }
          const fieldsToUpdate = queryResult.at(0)!.updateFields;
          return CardMetadataUpdater.apply(this.project, fieldsToUpdate);
        })
        .catch((error) => console.error(error));
    }
  }
}
