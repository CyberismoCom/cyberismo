// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { CreateCardsOptions } from './createCards/types.js';
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
  | CreateCardsOptions
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
  CreateCardsOptions,
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
