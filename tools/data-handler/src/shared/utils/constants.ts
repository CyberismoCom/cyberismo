// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { PredefinedCardMetadata } from '@cyberismo/model';

// Card key separator between project prefix and card ID
export const CARD_KEY_SEPARATOR = '_';

export const INT32_MAX = 2147483647; // 2^31-1

// Maximum level offset for includeMacro
export const MAX_LEVEL_OFFSET = 5;

// Root parent name
export const ROOT = 'root';

/**
 * These are file names that are valid for folder resources.
 * Note that the folders might still contain other files, such as .schema files,
 * but this is used for whitelisting the files that are allowed to be edited.
 */
export const VALID_FOLDER_RESOURCE_FILES = [
  'index.adoc.hbs',
  'query.lp.hbs',
  'parameterSchema.json',
  'view.lp.hbs',
  'model.lp',
  'calculation.lp',
  'skill.md',
  'query.lp',
];

/**
 * These are field names that are non-custom fields that present in metadata
 */
export const PREDEFINED_FIELDS = [
  'cardType',
  'externalLinks',
  'labels',
  'createdAt',
  'lastUpdated',
  'lastTransitioned',
  'links',
  'rank',
  'templateCardKey',
  'title',
  'workflowState',
] satisfies (keyof PredefinedCardMetadata)[];

/**
 * Checks if the given value is a predefined field.
 * @param value The field name to check.
 * @returns True if the value is a predefined field, false otherwise.
 */
export function isPredefinedField(
  value: string,
): value is keyof PredefinedCardMetadata {
  return (PREDEFINED_FIELDS as string[]).includes(value);
}

/**
 * Checks if a custom field value means 'no value'. An empty string means the
 * same as null or an absent key, and a custom field without a value is stored
 * as an absent key.
 * @param value The stored or written value.
 * @returns True if the value is null, undefined or an empty string.
 */
export function isEmptyFieldValue(
  value: unknown,
): value is null | undefined | '' {
  return value == null || value === '';
}
