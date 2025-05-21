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

import type { Card } from '../interfaces/project-interfaces.js';
import type {
  CardType,
  DataType,
  FieldType,
  GraphModelMetadata,
  GraphViewMetadata,
  Link,
  LinkType,
  ReportMetadata,
  TemplateMetadata,
  Workflow,
} from '../interfaces/resource-interfaces.js';
import { WorkflowCategory } from '../interfaces/resource-interfaces.js';
import { FIRST_RANK, getRankAfter, sortItems } from '../utils/lexorank.js';

// Helper function to get latest card rank from a set of cards.
function latestRank(cards: Card[]): string {
  // Only use cards that have 'rank'.
  const filteredCards = cards.filter(
    (c) => c.metadata?.rank !== undefined || c.metadata?.rank !== '',
  );

  let latestRank = sortItems(filteredCards, (c) => c.metadata?.rank || '').pop()
    ?.metadata?.rank;

  if (!latestRank) {
    latestRank = FIRST_RANK;
  }

  const newRank = getRankAfter(latestRank as string);
  latestRank = newRank;
  return latestRank;
}

/**
 * Provides default values for resources and cards.
 */
export abstract class DefaultContent {
  /**
   * Returns card with default content. Card is automatically ranked last, if siblings are provided.
   * @param cardType Card type; custom values from card type are set to null.
   * @param siblings Optional. If given, content will have been ranked last.
   * @returns card with default content.
   */
  static card(cardType: CardType, siblings?: Card[]) {
    return Object.assign(
      {
        title: 'Untitled',
        cardType: cardType.name,
        workflowState: '',
        rank: siblings ? latestRank(siblings) : '',
      },
      ...cardType.customFields
        .filter((field) => !field.isCalculated)
        .map((field) => ({ [field.name]: null })),
    );
  }

  /**
   * Default content for card type.
   * @param cardTypeName card type name
   * @param workflowName workflow name
   * @returns Default content for card type.
   */
  static cardType(cardTypeName: string, workflowName: string): CardType {
    return {
      name: cardTypeName,
      displayName: '',
      workflow: workflowName,
      customFields: [],
      alwaysVisibleFields: [],
      optionallyVisibleFields: [],
    };
  }

  /**
   * Default content for field type.
   * @param fieldTypeName field type name
   * @param dataType data type for the field type
   * @returns Default content for field type.
   */
  static fieldType(fieldTypeName: string, dataType: DataType): FieldType {
    const value = {
      name: fieldTypeName,
      displayName: '',
      dataType: dataType,
    } as FieldType;
    if (dataType === 'enum') {
      value.enumValues = [{ enumValue: 'value1' }, { enumValue: 'value2' }];
    }
    return value;
  }

  /**
   * Default content for graph model.
   * @param graphModelName graph model name
   * @returns Default content for graph model.
   */
  static graphModel(graphModelName: string): GraphModelMetadata {
    return {
      name: graphModelName,
      displayName: '',
    };
  }

  /**
   * Default content for graph view.
   * @param graphViewName graph view name
   * @returns Default content for graph view.
   */
  static graphView(graphViewName: string): GraphViewMetadata {
    return {
      name: graphViewName,
      displayName: '',
    };
  }

  /**
   * Default content for link.
   * @param cardKey card key id
   * @param linkTypeName link type name
   * @returns Default content for link.
   */
  static link(cardKey: string, linkTypeName: string): Link {
    return {
      linkType: linkTypeName,
      cardKey: cardKey,
    };
  }

  /**
   * Default content for link type.
   * @param linkTypeName link type name
   * @returns Default content for link type.
   */
  static linkType(linkTypeName: string): LinkType {
    return {
      name: linkTypeName,
      displayName: '',
      outboundDisplayName: linkTypeName,
      inboundDisplayName: linkTypeName,
      sourceCardTypes: [],
      destinationCardTypes: [],
      enableLinkDescription: false,
    };
  }

  /**
   * Default content for report type.
   * @param reportName report name
   * @returns Default content for report type.
   */
  static report(reportName: string): ReportMetadata {
    return {
      name: reportName,
      displayName: '',
      category: 'Uncategorised report',
    };
  }

  /**
   * Default template content
   * @returns Default template content
   */
  public static template(templateName: string): TemplateMetadata {
    return {
      name: templateName,
      displayName: '',
    };
  }

  /**
   * Default content for workflow JSON values.
   * @param {string} workflowName workflow name
   * @returns Default content for workflow JSON values.
   */
  public static workflow(workflowName: string): Workflow {
    return {
      name: workflowName,
      displayName: '',
      states: [
        { name: 'Draft', category: WorkflowCategory.initial },
        { name: 'Approved', category: WorkflowCategory.closed },
        { name: 'Deprecated', category: WorkflowCategory.closed },
      ],
      transitions: [
        {
          name: 'Create',
          fromState: [''],
          toState: 'Draft',
        },
        {
          name: 'Approve',
          fromState: ['Draft'],
          toState: 'Approved',
        },
        {
          name: 'Archive',
          fromState: ['*'],
          toState: 'Deprecated',
        },
      ],
    };
  }
}
