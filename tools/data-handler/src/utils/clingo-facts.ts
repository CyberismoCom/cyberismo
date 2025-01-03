/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
import { sep } from 'node:path';
import { Card } from '../interfaces/project-interfaces.js';
import {
  CardType,
  FieldType,
  Link,
  LinkType,
  Workflow,
} from '../interfaces/resource-interfaces.js';
import { ClingoProgramBuilder } from './clingo-program-builder.js';
import { AllowedClingoType, ClingoFactBuilder } from './clingo-fact-builder.js';
import { Project } from '../containers/project.js';
import { isPredefinedField } from './constants.js';

// I think namespace syntax is valid for this purpose
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Facts {
  export enum Workflow {
    WORKFLOW = 'workflow',
    WORKFLOW_STATE = 'workflowState',
    WORKFLOW_TRANSITION = 'workflowTransition',
  }
  export enum Card {
    LINK = 'link',
    LABEL = 'label',
    PARENT = 'parent',
  }

  export enum FieldType {
    FIELD_TYPE = 'fieldType',
    ENUM_VALUE = 'enumValue',
  }

  export enum Common {
    FIELD = 'field',
  }

  export enum CardType {
    CARD_TYPE = 'cardType',
    CUSTOM_FIELD = 'customField',
    ALWAYS_VISIBLE_FIELD = 'alwaysVisibleField',
    OPTIONALLY_VISIBLE_FIELD = 'optionallyVisibleField',
  }

  export enum LinkType {
    LINK_TYPE = 'linkType',
    LINK_SOURCE_CARD_TYPE = 'linkSourceCardType',
    LINK_DESTINATION_CARD_TYPE = 'linkDestinationCardType',
  }
}

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
  const parentsPath = parentPath(card.path);
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
          const fieldType = await project.fieldType(field);
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

  return builder.buildAll();
};

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

  if (fieldType.fieldDescription)
    builder.addFact(
      Facts.Common.FIELD,
      fieldType.name,
      'fieldDescription',
      fieldType.fieldDescription,
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

    builder.addCustomFact(Facts.Common.FIELD, (b) =>
      b
        .addArgument(keyTuple)
        .addArguments('isEditable', customField.isEditable),
    );

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
