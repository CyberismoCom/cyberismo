import { validateJson } from '../validate.js';
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
      if (!data) {
        throw new Error('data is required');
      }
      const options = validateMacroContent(macro, data);

      return createHtmlPlaceholder(macro, options);
    } catch (e) {
      return handleMacroError(e, macro);
    }
  },
};

export default macro;
