// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { FieldMacroOptions } from './types.js';

export type FieldMacroDisplay = NonNullable<FieldMacroOptions['display']>;

export const FIELD_MACRO_DEFAULT_DISPLAY: FieldMacroDisplay = 'row';

export function fieldMacroDefaultShowLabel(
  display: FieldMacroDisplay,
): boolean {
  return display === 'row';
}
