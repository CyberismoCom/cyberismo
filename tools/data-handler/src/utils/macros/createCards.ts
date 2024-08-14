/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import {
  createHtmlPlaceholder,
  handleMacroError,
  Macro,
  validateMacroContent,
} from './index.js';

export interface CreateCardsOptions {
  buttonLabel: string;
  template: string;
  cardKey?: string;
  [key: string]: string | undefined;
}

const macro: Macro<CreateCardsOptions> = {
  name: 'createCards',
  tagName: 'create-cards',
  schema: 'create-cards-macro-schema',
  handleStatic: (data: string) => {
    // Buttons aren't supported in static mode
    return '';
  },
  handleInject: (data: string) => {
    try {
      if (!data || typeof data !== 'string') {
        throw new Error('createCards macro requires a JSON object as data');
      }
      const options = validateMacroContent(macro, data);

      return createHtmlPlaceholder(macro, options);
    } catch (e) {
      return handleMacroError(e, macro);
    }
  },
};

export default macro;
