// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

export interface FieldMacroOptions {
  /**
   * Card to read and edit; defaults to the card the macro is rendered on
   */
  cardKey?: string;
  /**
   * Full field type name, or one of the predefined `title` and `workflowState`
   */
  field: string;
  /**
   * Show the field's label next to its value
   */
  showLabel?: boolean;
}
