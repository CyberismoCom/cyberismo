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
import { CreateCardsOptions } from './createCards/types.js';
import { GraphOptions } from './graph/types.js';
import { ImageMacroOptions } from './image/types.js';
import { IncludeMacroOptions } from './include/types.js';
import { PercentageOptions } from './percentage/types.js';
import { ReportOptions } from './report/types.js';
import { ScoreCardOptions } from './scoreCard/types.js';
import { VegaMacroInput } from './vega/types.js';
import { VegaLiteMacroInput } from './vegalite/types.js';
import { XrefMacroOptions } from './xref/types.js';

export type AnyMacroOption =
  | CreateCardsOptions
  | GraphOptions
  | ImageMacroOptions
  | IncludeMacroOptions
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
  PercentageOptions,
  ReportOptions,
  ScoreCardOptions,
  VegaMacroInput,
  VegaLiteMacroInput,
  XrefMacroOptions,
};
