// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import {
  FIELD_MACRO_DEFAULT_DISPLAY,
  fieldMacroDefaultShowLabel,
} from '@cyberismo/model';
import type {
  FieldMacroDisplay,
  IncludeMacroOptions,
  XrefMacroOptions,
  CreateCardsOptions,
  FieldMacroOptions,
  ReportOptions,
  GraphOptions,
} from '@cyberismo/model';

export const DEFAULT_INCLUDE_FORM_VALUES = {
  cardKey: '',
  levelOffset: '',
  pageTitles: null,
  title: null,
};

export const DEFAULT_XREF_FORM_VALUES = {
  cardKey: '',
};

export const DEFAULT_FIELD_FORM_VALUES: {
  cardKey: string;
  field: string;
  display: FieldMacroDisplay;
  showLabel: boolean;
} = {
  cardKey: '',
  field: '',
  display: FIELD_MACRO_DEFAULT_DISPLAY,
  showLabel: fieldMacroDefaultShowLabel(FIELD_MACRO_DEFAULT_DISPLAY),
};

export const DEFAULT_CREATE_CARDS_FORM_VALUES = {
  buttonLabel: '',
  template: '',
};

export const DEFAULT_REPORT_FORM_VALUES = {
  name: '',
};

export const DEFAULT_GRAPH_FORM_VALUES = {
  model: '',
  view: '',
};

export interface MacroModalProps<T> {
  /**
   * Whether the modal is open or not
   */
  open: boolean;
  /**
   * Called when modal wants to close itself
   */
  onClose: () => void;
  /**
   * Called when form is submitted
   * @param options Options for the macro. Exact type depends on the macro
   */
  onInsert: OnInsert<T>;
}

export type OnInsert<T> = (options: T) => void;

export type AnyOnInsert =
  | OnInsert<CreateCardsOptions>
  | OnInsert<FieldMacroOptions>
  | OnInsert<GraphOptions>
  | OnInsert<IncludeMacroOptions>
  | OnInsert<ReportOptions>
  | OnInsert<XrefMacroOptions>;
