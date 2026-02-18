/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.

  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import Processor from '@asciidoctor/core';
import { type CommandManager, evaluateMacros } from '@cyberismo/data-handler';
import type { QueryResult } from '@cyberismo/data-handler/types/queries';

// Special constant for transitions that work from any state
const ANY_STATE = '*';

/**
 * Enum value definition with display information
 */
export interface EnumOption {
  value: string;
  displayValue: string;
  description?: string;
}

/**
 * Field metadata with valid values for the AI to use
 */
export interface FieldInfo {
  key: string;
  displayName: string;
  description?: string;
  dataType: string;
  value: unknown;
  isCalculated: boolean;
  isEditable: boolean;
  visibility: 'always' | 'optional';
  enumValues?: EnumOption[];
}

/**
 * Available transition that can be performed on the card
 */
export interface AvailableTransition {
  name: string;
  toState: string;
  toStateCategory?: string;
}

/**
 * Information about what operations are denied on this card
 */
export interface DeniedOperations {
  transitions: string[];
  move: boolean;
  delete: boolean;
  editFields: string[];
  editContent: boolean;
}

/**
 * Notification or warning about the card
 */
export interface CardNotification {
  category: string;
  title: string;
  message: string;
}

/**
 * Link to another card
 */
export interface CardLink {
  linkType: string;
  linkTypeDisplayName: string;
  cardKey: string;
  cardTitle: string;
  direction: 'inbound' | 'outbound';
  linkDescription?: string;
}

export interface RenderedCard {
  // Basic identification
  key: string;
  title: string;
  cardType: string;
  cardTypeDisplayName: string;

  // Workflow state
  workflowState: string;
  availableTransitions: AvailableTransition[];

  // Content
  rawContent: string;
  parsedContent: string;

  // Metadata fields with valid values
  fields: FieldInfo[];

  // Hierarchy
  children: string[];
  parent?: string;

  // Attachments
  attachments: Array<{
    card: string;
    path: string;
    fileName: string;
    mimeType: string | null;
  }>;

  // Labels and links
  labels: string[];
  links: CardLink[];

  // Permissions - what can/cannot be done
  deniedOperations: DeniedOperations;

  // Notifications and policy checks
  notifications: CardNotification[];
  policyCheckFailures: Array<{
    category: string;
    title: string;
    errorMessage: string;
  }>;

  // Calculations (if any)
  calculations?: unknown[];
}

/**
 * Render a card with full macro evaluation, HTML conversion, and extended metadata
 */
export async function renderCard(
  commands: CommandManager,
  cardKey: string,
  options: { raw?: boolean } = {},
): Promise<RenderedCard> {
  // showCardDetails throws on invalid keys, so no null-check needed
  const card = await commands.showCmd.showCardDetails(cardKey);
  const rawContent = card.content || '';
  let parsedContent = rawContent;

  // Generate calculations and run card query
  let cardQueryResult: QueryResult<'card'> | null = null;

  if (!options.raw) {
    // Generate logic program for calculations
    await commands.calculateCmd.generate();

    // Evaluate macros (Clingo, graphs, reports)
    try {
      const asciidocContent = await evaluateMacros(rawContent, {
        context: 'localApp',
        mode: 'inject',
        project: commands.project,
        cardKey: cardKey,
      });

      // Convert AsciiDoc to HTML
      const processor = Processor();
      parsedContent = processor
        .convert(asciidocContent, {
          safe: 'safe',
          attributes: {
            imagesdir: `/api/cards/${cardKey}/a`,
            icons: 'font',
          },
        })
        .toString();
    } catch (error) {
      parsedContent = `Macro error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n${rawContent}`;
    }

    // Run the card query to get full details
    try {
      const results = await commands.calculateCmd.runQuery('card', 'localApp', {
        cardKey,
      });
      if (results.length > 0) {
        cardQueryResult = results[0];
      }
    } catch {
      // Query may fail, continue without extended data
    }
  }

  // Compute available transitions (skip in raw mode)
  const availableTransitions = options.raw
    ? []
    : await computeAvailableTransitions(
        commands,
        card.metadata?.cardType,
        cardQueryResult?.workflowState || card.metadata?.workflowState || '',
        cardQueryResult?.deniedOperations?.transition || [],
      );

  const fields = transformFields(
    cardQueryResult?.fields || [],
    cardQueryResult?.deniedOperations?.editField || [],
  );

  // Transform links
  const links = transformLinks(cardQueryResult?.links || []);

  // Transform denied operations
  const deniedOperations = transformDeniedOperations(
    cardQueryResult?.deniedOperations,
  );

  // Transform notifications
  const notifications = transformNotifications(
    cardQueryResult?.notifications || [],
  );

  return {
    key: card.key,
    title: cardQueryResult?.title || card.metadata?.title || '',
    cardType: cardQueryResult?.cardType || card.metadata?.cardType || '',
    cardTypeDisplayName:
      cardQueryResult?.cardTypeDisplayName || card.metadata?.cardType || '',
    workflowState:
      cardQueryResult?.workflowState || card.metadata?.workflowState || '',
    availableTransitions,
    rawContent,
    parsedContent,
    fields,
    children: card.children || [],
    parent: card.parent,
    attachments: card.attachments || [],
    labels: cardQueryResult?.labels || card.metadata?.labels || [],
    links,
    deniedOperations,
    notifications,
    policyCheckFailures: cardQueryResult?.policyChecks?.failures || [],
    calculations:
      (cardQueryResult as unknown as { calculations?: unknown[] })
        ?.calculations || [],
  };
}

/**
 * Compute available transitions based on workflow and current state
 */
async function computeAvailableTransitions(
  commands: CommandManager,
  cardTypeName: string | undefined,
  currentState: string,
  deniedTransitions: Array<{ transitionName: string; errorMessage: string }>,
): Promise<AvailableTransition[]> {
  if (!cardTypeName || !currentState) {
    return [];
  }

  try {
    // Get the card type to find the workflow
    const cardType = await commands.showCmd.showResource(
      cardTypeName,
      'cardTypes',
    );
    if (!cardType?.workflow) {
      return [];
    }

    // Get the workflow
    const workflow = await commands.showCmd.showResource(
      cardType.workflow,
      'workflows',
    );
    if (!workflow?.transitions) {
      return [];
    }

    // Get denied transition names for filtering
    const deniedNames = new Set(deniedTransitions.map((d) => d.transitionName));

    // Filter transitions that are valid from current state and not denied
    const available: AvailableTransition[] = [];
    for (const transition of workflow.transitions) {
      const canTransitionFrom =
        transition.fromState.includes(currentState) ||
        transition.fromState.includes(ANY_STATE);

      if (canTransitionFrom && !deniedNames.has(transition.name)) {
        // Find the target state category
        const targetState = workflow.states?.find(
          (s) => s.name === transition.toState,
        );

        available.push({
          name: transition.name,
          toState: transition.toState,
          toStateCategory: targetState?.category,
        });
      }
    }

    return available;
  } catch {
    return [];
  }
}

/**
 * Transform card query fields to FieldInfo with enum values
 */
function transformFields(
  fields: QueryResult<'card'>['fields'],
  deniedEditFields: Array<{ fieldName: string; errorMessage: string }>,
): FieldInfo[] {
  const deniedFieldNames = new Set(deniedEditFields.map((d) => d.fieldName));

  return fields.map((field) => ({
    key: field.key,
    displayName: field.fieldDisplayName || field.key,
    description: field.fieldDescription,
    dataType: field.dataType,
    value: field.value,
    isCalculated: field.isCalculated,
    isEditable: !field.isCalculated && !deniedFieldNames.has(field.key),
    visibility: field.visibility,
    enumValues: field.enumValues?.map((ev) => ({
      value: ev.enumValue,
      displayValue: ev.enumDisplayValue || ev.enumValue,
      description: ev.enumDescription,
    })),
  }));
}

/**
 * Transform calculation links to simpler CardLink format
 */
function transformLinks(links: QueryResult<'card'>['links']): CardLink[] {
  return links.map((link) => ({
    linkType: link.linkType,
    linkTypeDisplayName: link.displayName,
    cardKey: link.key,
    cardTitle: link.title,
    direction: link.direction,
    linkDescription: link.linkDescription,
  }));
}

/**
 * Transform denied operations to a simpler format
 */
function transformDeniedOperations(
  deniedOps: QueryResult<'card'>['deniedOperations'] | undefined,
): DeniedOperations {
  if (!deniedOps) {
    return {
      transitions: [],
      move: false,
      delete: false,
      editFields: [],
      editContent: false,
    };
  }

  return {
    transitions: deniedOps.transition?.map((t) => t.transitionName) || [],
    move: (deniedOps.move?.length || 0) > 0,
    delete: (deniedOps.delete?.length || 0) > 0,
    editFields: deniedOps.editField?.map((f) => f.fieldName) || [],
    editContent: (deniedOps.editContent?.length || 0) > 0,
  };
}

/**
 * Transform notifications to simpler format
 */
function transformNotifications(
  notifications: QueryResult<'card'>['notifications'],
): CardNotification[] {
  return notifications.map((n) => ({
    category: n.category,
    title: n.title,
    message: n.message,
  }));
}

/**
 * Get card tree with basic info (no content rendering)
 */
export async function getCardTree(commands: CommandManager): Promise<unknown> {
  await commands.calculateCmd.generate();
  const result = await commands.calculateCmd.runQuery('tree', 'localApp', {});
  return result;
}
