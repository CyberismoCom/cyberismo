/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import {
  CardType,
  DataType,
  FieldType,
  Link,
  LinkType,
  ReportMetadata,
  TemplateMetadata,
  WorkflowCategory,
  Workflow,
} from './interfaces/resource-interfaces.js';

export abstract class DefaultContent {
  /**
   * Default content for card type.
   * @param cardTypeName card type name
   * @param workflowName workflow name
   * @returns Default content for card type.
   */
  static cardType(cardTypeName: string, workflowName: string): CardType {
    return {
      name: cardTypeName,
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
      dataType: dataType,
    } as FieldType;
    if (dataType === 'enum') {
      value.enumValues = [{ enumValue: 'value1' }, { enumValue: 'value2' }];
    }
    return value;
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
  static linkTypeContent(linkTypeName: string): LinkType {
    return {
      name: linkTypeName,
      outboundDisplayName: linkTypeName,
      inboundDisplayName: linkTypeName,
      sourceCardTypes: [],
      destinationCardTypes: [],
      enableLinkDescription: false,
    };
  }

  /**
   * Default report content.
   * @returns Default content for link type.
   */
  static reportContent(): ReportMetadata {
    return {
      displayName: '',
      description: '',
      category: '',
    };
  }

  /**
   * Default template content
   * @returns Default template content
   */
  public static templateContent(templateName: string): TemplateMetadata {
    return { name: templateName };
  }

  /**
   * Default content for workflow JSON values.
   * @param {string} workflowName workflow name
   * @returns Default content for workflow JSON values.
   */
  public static workflowContent(workflowName: string): Workflow {
    return {
      name: workflowName,
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
