// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Workspace } from '@cyberismo/data-handler';
import type { DataType } from '@cyberismo/model';

export async function getFieldTypes(ws: Workspace) {
  const response = await ws.resources.list('fieldTypes');
  if (!response) {
    throw new Error('No field types found');
  }

  const fieldTypes = await Promise.all(
    response.map((fieldType: string) => ws.resources.show(fieldType)),
  );

  return fieldTypes;
}

export async function createFieldType(
  ws: Workspace,
  identifier: string,
  dataType: DataType,
) {
  await ws.resources.create(identifier, 'fieldTypes', { dataType });
}
