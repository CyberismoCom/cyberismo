/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { createHtmlPlaceholder, validateMacroContent } from '../index.js';

import { MacroGenerationContext } from '../../interfaces/macros.js';
import macroMetadata from './metadata.js';
import BaseMacro from '../BaseMacro.js';

export interface ScoreCardOptions {
  buttonLabel: string;
  template: string;
  cardKey?: string;
  [key: string]: string | undefined;
}

class ScoreCardMacro extends BaseMacro {
  constructor() {
    super(macroMetadata);
  }

  handleStatic = async (context: MacroGenerationContext, data: string) => {
    // TODO: tässä ei voi laittaa placeholdereita, koska export site ei niitä tue!
    // eli: joko tässä tuotetaan valmista html:ää tai sitten jotain muuta...
    return this.handleInject(context, data);
  };

  handleInject = async (_: MacroGenerationContext, data: string) => {
    if (!data || typeof data !== 'string') {
      throw new Error('scoreCard macro requires a JSON object as data');
    }
    const options = validateMacroContent<ScoreCardOptions>(this.metadata, data);

    return createHtmlPlaceholder(this.metadata, options);
  };
}

export default ScoreCardMacro;
