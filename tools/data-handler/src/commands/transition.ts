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
import type { Calculate } from './calculate.js';
import type {
  CardType,
  Workflow,
  WorkflowState,
} from '../interfaces/resource-interfaces.js';
import { CardMetadataUpdater } from '../card-metadata-updater.js';
import type { Project } from '../containers/project.js';

export class Transition {
  constructor(
    private project: Project,
    private calculateCmd: Calculate,
  ) {}

  /**
   * Transitions a card from its current state to a new state.
   * @param cardKey card key
   * @param transition which transition to do
   */
  public async cardTransition(cardKey: string, transition: WorkflowState) {
    // Card details
    const details = await this.project.cardDetailsById(cardKey, {
      metadata: true,
    });
    if (!details || !details.metadata) {
      throw new Error(`Card ${cardKey} does not exist in the project`);
    }

    // Card type
    const cardType = await this.project.resource<CardType>(
      details.metadata?.cardType,
    );
    if (cardType === undefined) {
      throw new Error(
        `Card's card type '${details.metadata?.cardType}' does not exist in the project`,
      );
    }

    // Workflow
    const workflow = await this.project.resource<Workflow>(cardType.workflow);
    if (workflow === undefined) {
      throw new Error(
        `Card's workflow '${cardType.workflow}' does not exist in the project`,
      );
    }

    // Check that the state transition can be made "from".
    const foundFrom = workflow.transitions.find(
      (item) =>
        (details.metadata &&
          item.fromState.includes(details.metadata?.workflowState)) ||
        item.fromState.includes('*'),
    );
    if (!foundFrom) {
      throw new Error(
        `Card's workflow '${cardType.workflow}' does not contain transition from card's current state '${details.metadata?.workflowState}'`,
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
        found.fromState.includes(details.metadata?.workflowState) ||
        found.fromState.includes('*')
      )
    ) {
      throw new Error(
        `Card's workflow '${cardType.workflow}' does not contain state transition from state '${details.metadata?.workflowState}' for '${transition.name}`,
      );
    }

    const actionGuard = new ActionGuard(this.calculateCmd);
    await actionGuard.checkPermission('transition', cardKey, transition.name);

    details.metadata.workflowState = found.toState;
    details.metadata.lastUpdated = new Date().toISOString();
    details.metadata.lastTransitioned = new Date().toISOString();
    return this.project
      .updateCardMetadata(details, details.metadata)
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

  // Wrapper to run onTransition query.
  private async transitionChangesQuery(cardKey: string, transition: string) {
    if (!cardKey || !transition) return undefined;
    return this.calculateCmd.runQuery('onTransition', 'localApp', {
      cardKey,
      transition,
    });
  }
}
