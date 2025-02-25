/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { EventEmitter } from 'node:events';

import { ActionGuard } from './permissions/action-guard.js';
import { Calculate } from './calculate.js';
import { Card } from './interfaces/project-interfaces.js';
import {
  CardType,
  Workflow,
  WorkflowState,
} from './interfaces/resource-interfaces.js';
import { Edit } from './edit.js';
import { Project } from './containers/project.js';

export class Transition extends EventEmitter {
  constructor(
    private project: Project,
    private calculateCmd: Calculate,
    private editCmd: Edit,
  ) {
    super();
    this.addListener(
      'transitioned',
      this.calculateCmd.handleCardChanged.bind(this.calculateCmd),
    );
  }

  // Sets card state
  private async setCardState(card: Card, state: string) {
    if (card.metadata) {
      card.metadata.workflowState = state;
      this.project.updateCardMetadata(card, card.metadata);
    }
  }

  /**
   * Transitions a card from its current state to a new state.
   * @param {string} cardKey card key
   * @param {string} transition which transition to do
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

    // Write new state
    await this.setCardState(details, found.toState); //todo: instead, this could just use project.updateCardMetadata
    await this.editCmd.editCardMetadata(
      details.key,
      'lastTransitioned',
      new Date().toISOString(),
    );
  }
}
