// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Workspace } from '@cyberismo/data-handler';
import type { FieldVisibilityBody } from './schema.js';

export async function getCardTypes(ws: Workspace) {
  const cardTypesWithDetails = await ws.resources.contents('cardTypes');
  return cardTypesWithDetails;
}

export async function createCardType(
  ws: Workspace,
  cardTypeName: string,
  workflowName: string,
) {
  await ws.resources.create(cardTypeName, 'cardTypes', {
    workflow: workflowName,
  });
}

/** Puts a field of a card type in a visibility group, optionally at a position. */
export async function updateFieldVisibility(
  ws: Workspace,
  cardTypeName: string,
  body: FieldVisibilityBody,
): Promise<void> {
  const { fieldName, group, index } = body;
  await ws.resources.setFieldVisibility(cardTypeName, fieldName, group, index);
}
