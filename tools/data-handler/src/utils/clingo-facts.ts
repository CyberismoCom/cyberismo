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
import { sep } from 'node:path';

import {
  type AllowedClingoType,
  ClingoFactBuilder,
} from './clingo-fact-builder.js';
import type { Card, ModuleContent } from '../interfaces/project-interfaces.js';
import type {
  CardType,
  FieldType,
  Link,
  LinkType,
  ReportMetadata,
  TemplateMetadata,
  Workflow,
} from '../interfaces/resource-interfaces.js';
import { ClingoProgramBuilder } from './clingo-program-builder.js';
import { isPredefinedField } from './constants.js';
import { isTemplateCard } from '../utils/card-utils.js';
import type { Project } from '../containers/project.js';

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Facts {
  export enum Card {
    LABEL = 'label',
    LINK = 'userLink',
    PARENT = 'parent',
  }

  export enum Common {
    FIELD = 'field',
    MODULE = 'module',
    PROJECT = 'project',
  }

  export enum CardType {
    ALWAYS_VISIBLE_FIELD = 'alwaysVisibleField',
    CALCULATED_FIELD = 'calculatedField',
    CARD_TYPE = 'cardType',
    CUSTOM_FIELD = 'customField',
    OPTIONALLY_VISIBLE_FIELD = 'optionallyVisibleField',
  }

  export enum FieldType {
    ENUM_VALUE = 'enumValue',
    FIELD_TYPE = 'fieldType',
  }

  export enum LinkType {
    LINK_DESTINATION_CARD_TYPE = 'linkDestinationCardType',
    LINK_SOURCE_CARD_TYPE = 'linkSourceCardType',
    LINK_TYPE = 'linkType',
  }

  export enum Report {
    REPORT = 'report',
  }

  export enum Template {
    TEMPLATE = 'template',
  }

  export enum Workflow {
    WORKFLOW = 'workflow',
    WORKFLOW_STATE = 'workflowState',
    WORKFLOW_TRANSITION = 'workflowTransition',
  }
}

// Compares two index values.
function compareIndex(a: number, b: number): number {
  if (a === -1 && b === -1) {
    return 0;
  } else if (a === -1) {
    return 1;
  } else if (b === -1) {
    return -1;
  }
  return a - b;
}

/**
 * Creates Clingo facts for a workflow.
 * @param workflow Workflow metadata
 * @returns clingo facts as a string
 */
export const createWorkflowFacts = (workflow: Workflow) => {
  const builder = new ClingoProgramBuilder().addFact(
    Facts.Workflow.WORKFLOW,
    workflow.name,
  );
  // add states
  for (const state of workflow.states) {
    if (state.category) {
      builder.addFact(
        Facts.Workflow.WORKFLOW_STATE,
        workflow.name,
        state.name,
        state.category,
      );
    } else {
      builder.addFact(Facts.Workflow.WORKFLOW_STATE, workflow.name, state.name);
    }
  }

  // add transitions
  for (const transition of workflow.transitions) {
    for (const from of transition.fromState) {
      builder.addFact(
        Facts.Workflow.WORKFLOW_TRANSITION,
        workflow.name,
        transition.name,
        from,
        transition.toState,
      );
    }
    if (transition.fromState.length === 0) {
      builder.addFact(
        Facts.Workflow.WORKFLOW_TRANSITION,
        workflow.name,
        transition.name,
        '',
        transition.toState,
      );
    }
  }
  return builder.buildAll();
};

/**
 * Creates Clingo facts for a card.
 * @param card Card information
 * @param project Project information
 * @returns clingo facts as a string
 */
export const createCardFacts = async (card: Card, project: Project) => {
  // Small helper to deduce parent path
  function parentPath(cardPath: string) {
    const pathParts = cardPath.split(sep);
    if (pathParts.at(pathParts.length - 2) === 'cardRoot') {
      return '';
    } else {
      return pathParts.at(pathParts.length - 3);
    }
  }

  // Helper to deduce template parent path.
  function parentPathFromTemplate(card: Card) {
    const cardPath = card.path;
    const pathParts = cardPath.split(sep);
    if (pathParts.length <= 6) {
      // template or module template paths should have a minimum of seven parts.
      return '';
    }
    if (isTemplateCard(card)) {
      // Parent is a card
      if (pathParts.at(pathParts.length - 4) === 'c') {
        return pathParts.at(pathParts.length - 3);
      }
      // Parent is a template
      const prefix =
        pathParts.at(pathParts.length - 5) === 'local'
          ? project.projectPrefix
          : pathParts.at(pathParts.length - 5);
      const resourceType = pathParts.at(pathParts.length - 4);
      const templateName = pathParts.at(pathParts.length - 3);
      return `"${prefix}/${resourceType}/${templateName}"`;
    }
  }

  const parentsPath = isTemplateCard(card)
    ? parentPathFromTemplate(card)
    : parentPath(card.path);
  const builder = new ClingoProgramBuilder().addComment(card.key);

  if (card.metadata) {
    for (const [field, value] of Object.entries(card.metadata)) {
      if (field === 'labels') {
        for (const label of value as Array<string>) {
          builder.addCustomFact(Facts.Card.LABEL, (b) =>
            b.addLiteralArgument(card.key).addArgument(label),
          );
        }
      } else if (field === 'links') {
        for (const link of value as Link[]) {
          builder.addCustomFact(Facts.Card.LINK, (b) =>
            b
              .addLiteralArguments(card.key, link.cardKey)
              .addArguments(link.linkType, link.linkDescription ?? null),
          );
        }
      } else {
        // Do not write null values
        if (value == null) {
          continue;
        }
        // field might be a non-custom field, which cannot use the fieldType method

        let clingoValue: AllowedClingoType = value.toString();

        if (!isPredefinedField(field)) {
          // field is a custom field, find it
          const fieldType = await project.resource<FieldType>(field);
          if (!fieldType) {
            continue;
          }

          // if it's a list, let's generate multiple values
          if (fieldType.dataType === 'list') {
            if (!Array.isArray(value)) {
              continue;
            }
            for (const listValue of value) {
              builder.addCustomFact(Facts.Common.FIELD, (b) =>
                b
                  .addLiteralArgument(card.key)
                  .addArguments(field, listValue.toString()),
              );
            }
            continue;
          }

          clingoValue =
            fieldType.dataType === 'integer'
              ? (value as number)
              : value.toString();
        }

        builder.addCustomFact(Facts.Common.FIELD, (b) =>
          b.addLiteralArgument(card.key).addArguments(field, clingoValue),
        );
      }
    }
  }

  if (parentsPath !== undefined && parentsPath !== '') {
    builder.addCustomFact(Facts.Card.PARENT, (b) =>
      b.addLiteralArguments(card.key, parentsPath),
    );
  }
  builder.addCustomFact(Facts.Common.FIELD, (b) =>
    b
      .addLiteralArgument(card.key)
      .addArguments('container', isTemplateCard(card) ? 'template' : 'project'),
  );

  return builder.buildAll();
};

/**
 * Creates Clingo facts for a field type.
 * @param fieldType Field type metadata
 * @returns clingo facts as a string
 */
export const createFieldTypeFacts = (fieldType: FieldType) => {
  const builder = new ClingoProgramBuilder();
  builder.addFact(Facts.FieldType.FIELD_TYPE, fieldType.name);

  if (fieldType.displayName)
    builder.addFact(
      Facts.Common.FIELD,
      fieldType.name,
      'displayName',
      fieldType.displayName,
    );

  if (fieldType.description)
    builder.addFact(
      Facts.Common.FIELD,
      fieldType.name,
      'description',
      fieldType.description,
    );

  builder.addFact(
    Facts.Common.FIELD,
    fieldType.name,
    'dataType',
    fieldType.dataType,
  );

  if (fieldType.enumValues) {
    let index = 1;
    for (const enumValue of fieldType.enumValues) {
      builder.addFact(
        Facts.FieldType.ENUM_VALUE,
        fieldType.name,
        enumValue.enumValue,
      );
      builder.addCustomFact(Facts.Common.FIELD, (b) =>
        b
          .addArgument((key) =>
            key.addArguments(fieldType.name, enumValue.enumValue),
          )
          .addArguments('index', index++),
      );

      const keyTuple = new ClingoFactBuilder('', '').addArguments(
        fieldType.name,
        enumValue.enumValue,
      );

      if (enumValue.enumDisplayValue)
        builder.addCustomFact(Facts.Common.FIELD, (b) =>
          b
            .addArgument(keyTuple)
            .addArguments('enumDisplayValue', enumValue.enumDisplayValue!),
        );

      if (enumValue.enumDescription)
        builder.addCustomFact(Facts.Common.FIELD, (b) =>
          b
            .addArgument(keyTuple)
            .addArguments('enumDescription', enumValue.enumDescription!),
        );
    }
  }
  return builder.buildAll();
};

/**
 * Creates Clingo facts for a card type.
 * @param cardType Card type metadata
 * @returns clingo facts as a string
 */
export const createCardTypeFacts = (cardType: CardType) => {
  const builder = new ClingoProgramBuilder();

  builder.addFact(Facts.CardType.CARD_TYPE, cardType.name);

  builder.addFact(
    Facts.Common.FIELD,
    cardType.name,
    'workflow',
    cardType.workflow,
  );

  const customFields = cardType.customFields.toSorted((a, b) => {
    const aFirstIndex = cardType.alwaysVisibleFields.indexOf(a.name);
    const bFirstIndex = cardType.alwaysVisibleFields.indexOf(b.name);

    const aSecondIndex = cardType.optionallyVisibleFields.indexOf(a.name);
    const bSecondIndex = cardType.optionallyVisibleFields.indexOf(b.name);

    return compareIndex(aFirstIndex, bFirstIndex) === 0
      ? compareIndex(aSecondIndex, bSecondIndex)
      : compareIndex(aFirstIndex, bFirstIndex);
  });
  let index = 1;
  for (const customField of customFields) {
    builder.addFact(
      Facts.CardType.CUSTOM_FIELD,
      cardType.name,
      customField.name,
    );
    const keyTuple = new ClingoFactBuilder('', '').addArguments(
      cardType.name,
      customField.name,
    );
    if (customField.displayName) {
      builder.addCustomFact(Facts.Common.FIELD, (b) =>
        b.addArgument(keyTuple).addArguments(
          'displayName',
          customField.displayName as string, // not sure why type check doesn't get this
        ),
      );
    }
    if (customField.isCalculated) {
      builder.addFact(
        Facts.CardType.CALCULATED_FIELD,
        cardType.name,
        customField.name,
      );
    }

    let visible = false;
    if (cardType.alwaysVisibleFields.includes(customField.name)) {
      builder.addFact(
        Facts.CardType.ALWAYS_VISIBLE_FIELD,
        cardType.name,
        customField.name,
      );
      visible = true;
    }
    if (cardType.optionallyVisibleFields.includes(customField.name)) {
      builder.addFact(
        Facts.CardType.OPTIONALLY_VISIBLE_FIELD,
        cardType.name,
        customField.name,
      );
      visible = true;
    }
    if (visible) {
      builder.addCustomFact(Facts.Common.FIELD, (b) =>
        b
          .addArgument((key) =>
            key.addArguments(cardType.name, customField.name),
          )
          .addArguments('index', index++),
      );
    }
  }
  return builder.buildAll();
};

/**
 * Creates Clingo facts for a link type.
 * @param linkType Link type metadata
 * @returns clingo facts as a string
 */
export const createLinkTypeFacts = (linkType: LinkType) => {
  const builder = new ClingoProgramBuilder()
    .addFact(Facts.LinkType.LINK_TYPE, linkType.name)
    .addFact(
      Facts.Common.FIELD,
      linkType.name,
      'outboundDisplayName',
      linkType.outboundDisplayName,
    )
    .addFact(
      Facts.Common.FIELD,
      linkType.name,
      'inboundDisplayName',
      linkType.inboundDisplayName,
    )
    .addFact(
      Facts.Common.FIELD,
      linkType.name,
      'enableLinkDescription',
      linkType.enableLinkDescription,
    );

  for (const sourceCardType of linkType.sourceCardTypes) {
    builder.addFact(
      Facts.LinkType.LINK_SOURCE_CARD_TYPE,
      linkType.name,
      sourceCardType,
    );
  }

  for (const destinationCardType of linkType.destinationCardTypes) {
    builder.addFact(
      Facts.LinkType.LINK_DESTINATION_CARD_TYPE,
      linkType.name,
      destinationCardType,
    );
  }

  return builder.buildAll();
};

/**
 * Creates Clingo facts for a module.
 * @param module Module metadata
 * @returns clingo facts as a string
 */
export const createModuleFacts = (module: ModuleContent) => {
  const builder = new ClingoProgramBuilder();
  builder.addFact(Facts.Common.MODULE, module.cardKeyPrefix);
  builder.addFact(
    Facts.Common.FIELD,
    module.cardKeyPrefix,
    'name',
    module.name,
  );
  return builder.buildAll();
};

/**
 * Creates Clingo facts for a project.
 * @param projectPrefix Card prefix of the project
 * @returns clingo facts as a string
 */
export const createProjectFacts = (projectPrefix: string) => {
  const builder = new ClingoProgramBuilder();
  builder.addFact(Facts.Common.PROJECT, projectPrefix);
  return builder.buildAll();
};

/**
 * Creates Clingo facts for a report.
 * @param report Report metadata
 * @returns clingo facts as a string
 */
export const createReportFacts = (report: ReportMetadata) => {
  const builder = new ClingoProgramBuilder();
  builder.addFact(Facts.Report.REPORT, report.name);

  if (report.displayName)
    builder.addFact(
      Facts.Common.FIELD,
      report.name,
      'displayName',
      report.displayName,
    );
  if (report.description)
    builder.addFact(
      Facts.Common.FIELD,
      report.name,
      'description',
      report.description,
    );
  if (report.category)
    builder.addFact(
      Facts.Common.FIELD,
      report.name,
      'category',
      report.category,
    );
  return builder.buildAll();
};

/**
 * Creates Clingo facts about template.
 * @param template Template metadata
 * @returns clingo facts as a string
 */
export const createTemplateFacts = (template: TemplateMetadata) => {
  const builder = new ClingoProgramBuilder();
  builder.addFact(Facts.Template.TEMPLATE, template.name);

  if (template.displayName)
    builder.addFact(
      Facts.Common.FIELD,
      template.name,
      'displayName',
      template.displayName,
    );
  if (template.description)
    builder.addFact(
      Facts.Common.FIELD,
      template.name,
      'description',
      template.description,
    );
  if (template.category)
    builder.addFact(
      Facts.Common.FIELD,
      template.name,
      'category',
      template.category,
    );
  return builder.buildAll();
};
