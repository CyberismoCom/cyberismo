/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import type { MacroMetadata } from '../../interfaces/macros.js';
import type { VegaLiteMacroInput } from './types.js';

const macroMetadata: MacroMetadata<VegaLiteMacroInput> = {
  name: 'vegaLite',
  tagName: 'vegaLite',
  schema: 'vegaLiteMacroSchema',
  default: {
    spec: {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      data: {
        values: [
          { x: 1, y: 2 },
          { x: 2, y: 3 },
        ],
      },
      mark: 'point',
      encoding: {
        x: { field: 'x', type: 'quantitative' },
        y: { field: 'y', type: 'quantitative' },
      },
    },
  },
};

export default macroMetadata;
