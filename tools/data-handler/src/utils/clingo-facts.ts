import { sep } from 'path';
import { Card } from '../interfaces/project-interfaces.js';
import {
  CardType,
  FieldType,
  Link,
  LinkType,
  Workflow,
} from '../interfaces/resource-interfaces.js';
import { ClingoProgramBuilder } from './clingo-program-builder.js';
import { ClingoFactBuilder } from './clingo-fact-builder.js';

export const createWorkflowFacts = (workflow: Workflow) => {
  const builder = new ClingoProgramBuilder().addFact('workflow', workflow.name);
  // add states
  for (const state of workflow.states) {
    if (state.category) {
      builder.addFact(
        'workflowState',
        workflow.name,
        state.name,
        state.category,
      );
    } else {
      builder.addFact('workflowState', workflow.name, state.name);
    }
  }

  // add transitions
  for (const transition of workflow.transitions) {
    for (const from of transition.fromState) {
      builder.addFact(
        'workflowTransition',
        workflow.name,
        transition.name,
        from,
        transition.toState,
      );
    }
    if (transition.fromState.length === 0) {
      builder.addFact(
        'workflowTransition',
        workflow.name,
        transition.name,
        '',
        transition.toState,
      );
    }
  }
  return builder.buildAll();
};

export const createCardFacts = (card: Card) => {
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
          builder.addCustomFact('label', (b) =>
            b.addLiteralArgument(card.key).addArgument(label),
          );
        }
      } else if (field === 'links') {
        for (const link of value as Link[]) {
          builder.addCustomFact('link', (b) =>
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
        builder.addCustomFact('field', (b) =>
          b.addLiteralArgument(card.key).addArguments(field, value.toString()),
        );
      }
    }
  }

  if (parentsPath !== undefined && parentsPath !== '') {
    builder.addCustomFact('parent', (b) =>
      b.addLiteralArguments(card.key, parentsPath),
    );
  }

  return builder.buildAll();
};

export const createFieldTypeFacts = (fieldType: FieldType) => {
  const builder = new ClingoProgramBuilder();
  builder.addFact('fieldType', fieldType.name);

  if (fieldType.displayName)
    builder.addFact(
      'field',
      fieldType.name,
      'displayName',
      fieldType.displayName,
    );

  if (fieldType.fieldDescription)
    builder.addFact(
      'field',
      fieldType.name,
      'fieldDescription',
      fieldType.fieldDescription,
    );

  builder.addFact('field', fieldType.name, 'dataType', fieldType.dataType);

  if (fieldType.enumValues) {
    let index = 1;
    for (const enumValue of fieldType.enumValues) {
      builder.addFact('enumValue', fieldType.name, enumValue.enumValue);
      builder.addCustomFact('field', (b) =>
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
        builder.addCustomFact('field', (b) =>
          b
            .addArgument(keyTuple)
            .addArguments('enumDisplayValue', enumValue.enumDisplayValue),
        );

      if (enumValue.enumDescription)
        builder.addCustomFact('field', (b) =>
          b
            .addArgument(keyTuple)
            .addArguments('enumDescription', enumValue.enumDescription),
        );
    }
  }
  return builder.buildAll();
};

export const createCardTypeFacts = (cardType: CardType) => {
  const builder = new ClingoProgramBuilder();

  builder.addFact('cardType', cardType.name);

  builder.addFact('field', cardType.name, 'workflow', cardType.workflow);

  let index = 1;
  for (const customField of cardType.customFields) {
    builder.addFact('customField', cardType.name, customField.name);
    const keyTuple = new ClingoFactBuilder('', '').addArguments(
      cardType.name,
      customField.name,
    );
    if (customField.displayName) {
      builder.addCustomFact('field', (b) =>
        b.addArgument(keyTuple).addArguments(
          customField.name,
          'displayName',
          customField.displayName as string, // not sure why type check doesn't get this
        ),
      );
    }

    builder.addCustomFact('field', (b) =>
      b
        .addArgument(keyTuple)
        .addArguments(customField.name, 'isEditable', customField.isEditable),
    );

    let visible = false;
    if (cardType.alwaysVisibleFields.includes(customField.name)) {
      builder.addFact('alwaysVisibleField', cardType.name, customField.name);
      visible = true;
    }
    if (cardType.optionallyVisibleFields.includes(customField.name)) {
      builder.addFact(
        'optionallyVisibleField',
        cardType.name,
        customField.name,
      );
      visible = true;
    }
    if (visible) {
      builder.addCustomFact('field', (b) =>
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
    .addFact('linkType', linkType.name)
    .addFact(
      'field',
      linkType.name,
      'outboundDisplayName',
      linkType.outboundDisplayName,
    )
    .addFact(
      'field',
      linkType.name,
      'inboundDisplayName',
      linkType.inboundDisplayName,
    )
    .addFact(
      'field',
      linkType.name,
      'enableLinkDescription',
      linkType.enableLinkDescription,
    );

  for (const sourceCardType of linkType.sourceCardTypes) {
    builder.addFact('linkSourceCardType', linkType.name, sourceCardType);
  }

  for (const destinationCardType of linkType.destinationCardTypes) {
    builder.addFact(
      'linkDestinationCardType',
      linkType.name,
      destinationCardType,
    );
  }

  return builder.buildAll();
};
