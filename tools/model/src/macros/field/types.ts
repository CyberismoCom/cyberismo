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
   * Show the field's label next to its value; defaults to true for `row` and
   * false for `inline`
   */
  showLabel?: boolean;
  /**
   * `row` is a labelled row of its own, `inline` sits within the surrounding
   * text; defaults to `row`
   */
  display?: 'row' | 'inline';
}
