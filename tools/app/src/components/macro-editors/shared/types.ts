/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type {
  IncludeMacroOptions,
  XrefMacroOptions,
  CreateCardsOptions,
  ReportOptions,
  GraphOptions,
} from '@cyberismo/data-handler';

export const DEFAULT_INCLUDE_FORM_VALUES = {
  cardKey: '',
  levelOffset: '',
  title: null,
  pageTitles: null,
};

export const DEFAULT_XREF_FORM_VALUES = {
  cardKey: '',
};

export const DEFAULT_CREATE_CARDS_FORM_VALUES = {
  template: '',
  buttonLabel: '',
};

export const DEFAULT_REPORT_FORM_VALUES = {
  name: '',
};

export const DEFAULT_GRAPH_FORM_VALUES = {
  view: '',
  model: '',
};

export type OnInsert<T> = (options: T) => void;

export type AnyOnInsert =
  | OnInsert<IncludeMacroOptions>
  | OnInsert<XrefMacroOptions>
  | OnInsert<CreateCardsOptions>
  | OnInsert<ReportOptions>
  | OnInsert<GraphOptions>;
