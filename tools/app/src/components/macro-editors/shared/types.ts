// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type {
  IncludeMacroOptions,
  XrefMacroOptions,
  CreateCardsOptions,
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
  | OnInsert<GraphOptions>
  | OnInsert<IncludeMacroOptions>
  | OnInsert<ReportOptions>
  | OnInsert<XrefMacroOptions>;
