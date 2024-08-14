/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import Handlebars from 'handlebars';
import createCards from './createCards.js';
import { validateJson } from '../validate.js';
import { DHValidationError } from '../../exceptions/index.js';

type Mode = 'static' | 'inject';

export interface Macro<T> {
  /**
   * The name of the macro. This is the name that will be used in the content
   */
  name: string;
  /**
   * The tag name of the macro. This is the name that will be used in the HTML. This is separated for clarity since tags cannot have uppercase letters
   */
  tagName: string;

  /**
   * The schema of the macro. This is used to validate the data passed to the macro
   */
  schema: string;
  /**
   * The function to handle the macro in static mode(when adoc is being generated)
   */
  handleStatic: (data: string) => string;
  /**
   * Inject mode handler - Used to generate an injectable pass-through element
   */
  handleInject: (data: string) => string;
}

export function validateMacroContent<T>(macro: Macro<T>, data: string): T {
  return validateJson<T>(JSON.parse(data), macro.schema);
}

export const macros = {
  createCards,
};

export type MacroName = keyof typeof macros;

/**
 * Registers the macros with Handlebars
 * @param {Mode} mode - The mode to register the macros in
 */
export function registerMacros(instance: typeof Handlebars, mode: Mode) {
  for (const macro of Object.keys(macros) as MacroName[]) {
    instance.registerHelper(macro, function (data: string) {
      return macros[macro][mode === 'static' ? 'handleStatic' : 'handleInject'](
        data,
      );
    });
  }
}

/**
 * Handle the macros in the content
 */
export function handleMacros(content: string, mode: Mode) {
  const handlebars = Handlebars.create();
  registerMacros(handlebars, mode);
  return handlebars.compile(content, {
    strict: true,
  })({});
}

/**
 * Validates macros and returns the cause of the error
 * @param content - The content to validate
 * @returns The error message or null if template is valid
 */
export function validateMacros(content: string): string | null {
  const handlebars = Handlebars.create();

  registerMacros(handlebars, 'static');

  const template = handlebars.compile(content, {
    strict: true,
  });

  try {
    template({});
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Unknown error';
  }
}

/**
 * Handles errors that come when handling macros
 * @param error - The error that was thrown
 * @param macro - The macro that caused the error
 * @returns The error message that is valid adoc
 */
export function handleMacroError<T>(error: unknown, macro: Macro<T>): string {
  if (error instanceof DHValidationError) {
    return `Check json syntax of macro ${macro.name}: ${error.errors?.map((e) => e.message).join(', ')}`;
  }
  return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
}

/**
 *
 */
export function createHtmlPlaceholder(
  macro: Macro<any>,
  options: Record<string, string | undefined>,
) {
  return `++++\n<${macro.tagName} ${Object.keys(options)
    .map((key) => `${key}=${options[key]}`)
    .join(' ')}></${macro.tagName}>\n++++`;
}
