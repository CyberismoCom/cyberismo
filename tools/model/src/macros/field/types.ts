// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

export interface FieldMacroOptions {
  /**
   * Full field type name, or one of the predefined `title` and `workflowState`
   */
  field: string;
  /**
   * Show the field's label next to its value
   */
  showLabel?: boolean;
}
