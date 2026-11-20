// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { ActionButtonOptions, ActionMacroOptions } from './action/types.js';
import { CreateCardsOptions } from './createCards/types.js';
import { CreateLinksOptions } from './createLinks/types.js';
import { FieldMacroOptions } from './field/types.js';
import { GraphOptions } from './graph/types.js';
import { ImageMacroOptions } from './image/types.js';
import { IncludeMacroOptions } from './include/types.js';
import { PercentageOptions } from './percentage/types.js';
import { ReportOptions } from './report/types.js';
import { ScoreCardOptions } from './scoreCard/types.js';
import { MermaidMacroInput } from './mermaid/types.js';
import { VegaMacroInput } from './vega/types.js';
import { VegaLiteMacroInput } from './vegalite/types.js';
import { XrefMacroOptions } from './xref/types.js';

export type AnyMacroOption =
  | ActionMacroOptions
  | CreateCardsOptions
  | CreateLinksOptions
  | FieldMacroOptions
  | GraphOptions
  | ImageMacroOptions
  | IncludeMacroOptions
  | MermaidMacroInput
  | PercentageOptions
  | ReportOptions
  | ScoreCardOptions
  | VegaMacroInput
  | VegaLiteMacroInput
  | XrefMacroOptions;

export {
  MAX_ACTION_PROGRAM_LENGTH,
  MAX_ACTION_PROGRAMS,
} from './action/types.js';

export {
  ActionButtonOptions,
  ActionMacroOptions,
  CreateCardsOptions,
  CreateLinksOptions,
  FieldMacroOptions,
  GraphOptions,
  ImageMacroOptions,
  IncludeMacroOptions,
  MermaidMacroInput,
  PercentageOptions,
  ReportOptions,
  ScoreCardOptions,
  VegaMacroInput,
  VegaLiteMacroInput,
  XrefMacroOptions,
};
