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
import { applySideEffects, type SideEffects } from '../side-effects.js';
import { getChildLogger } from '../utils/log-utils.js';
import type { Project } from '../containers/project.js';
import { write } from '../utils/rw-lock.js';

/**
 * Handles transitions.
 */
export class Transition {
  private static get logger() {
    return getChildLogger({ module: 'transition' });
  }

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
   * Performs a single workflow transition without cascading, and returns
   * its side effects for the caller to execute. Throws if the card is
   * missing, the transition is not available from the card's current state,
   * or the transition is denied.
   *
   * Must run inside a write-lock context (cardTransition, or the creation
   * flow's side-effect execution).
   */
  public async performTransition(
    cardKey: string,
    transitionName: string,
  ): Promise<SideEffects | undefined> {
    const card = this.project.findCard(cardKey);

    if (!card.metadata?.cardType) {
      throw new Error(`Card does not have card type`);
    }
    // Card type
    const cardType = this.project.resources
      .byType(card.metadata?.cardType, 'cardTypes')
      .show();

    // Workflow
    const workflow = this.project.resources
      .byType(cardType.workflow, 'workflows')
      .show();

    const currentState = card.metadata.workflowState;

    // A transition is identified by its (unique) name and leads to a single
    // target state, though it may be available from several states or all
    // states ('*'). Find it by name, then check it can be made from the
    // card's current state.
    const byName = workflow.transitions.filter(
      (item) => item.name === transitionName,
    );
    if (byName.length === 0) {
      const transitionNames = workflow.transitions.map((item) => item.name);
      throw new Error(`Card's workflow '${cardType.workflow}' does not contain state transition '${transitionName}'.
                          \nThe available transitions are: ${transitionNames.join(', ')}`);
    }

    const found = byName.find(
      (item) =>
        item.fromState.includes(currentState) || item.fromState.includes('*'),
    );
    if (!found) {
      throw new Error(
        `Card's workflow '${cardType.workflow}' does not contain state transition from state '${currentState}' for '${transitionName}'`,
      );
    }

    const actionGuard = new ActionGuard(this.project.calculationEngine);
    await actionGuard.checkPermission('transition', cardKey, transitionName);

    card.metadata.workflowState = found.toState;
    // lastUpdated is stamped by saveCardMetadata on every save; only
    // lastTransitioned needs to be set here.
    card.metadata.lastTransitioned = new Date().toISOString();
    await this.project.updateCardMetadata(card, card.metadata);

    // A broken module calculation must not fail the transition itself.
    try {
      const queryResult = await this.transitionChangesQuery(
        cardKey,
        transitionName,
      );
      return queryResult?.at(0);
    } catch (error) {
      Transition.logger.warn(
        {
          cardKey,
          transition: transitionName,
          error: error instanceof Error ? error.message : String(error),
        },
        'onTransition query failed; side effects skipped',
      );
      return undefined;
    }
  }

  /**
   * Executes a transition's side effects (field updates and cascading
   * transitions on other cards). Never throws: module calculation problems
   * must not fail the user's primary action.
   * @param effects Side effects from an onTransition/onCreation query.
   * @param visited `cardKey:transitionName` pairs already attempted in this
   *                cascade.
   */
  public async executeSideEffects(
    effects: SideEffects | undefined,
    visited: Set<string>,
  ): Promise<void> {
    try {
      await applySideEffects(this.project, effects, visited, (card, name) =>
        this.performTransition(card, name),
      );
    } catch (error) {
      Transition.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        'Applying transition side effects failed',
      );
    }
  }

  /**
   * Transitions a card from its current state to a new state, then executes
   * any side effects modules have declared for the transition.
   * @param cardKey card key
   * @param transitionName name of the transition to do
   */
  @write((cardKey) => `Transition card ${cardKey}`)
  public async cardTransition(cardKey: string, transitionName: string) {
    const effects = await this.performTransition(cardKey, transitionName);
    await this.executeSideEffects(
      effects,
      new Set([`${cardKey}:${transitionName}`]),
    );
  }
}
