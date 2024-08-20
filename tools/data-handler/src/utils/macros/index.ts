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
import { AdmonitionType } from '../../interfaces/adoc.js';
import { Validator } from 'jsonschema';

type Mode = 'static' | 'inject';

export interface Macro {
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
  schema?: string;
  /**
   * The function to handle the macro in static mode(when adoc is being generated)
   */
  handleStatic: (data: string) => string;
  /**
   * Inject mode handler - Used to generate an injectable pass-through element
   */
  handleInject: (data: string) => string;
}

export function validateMacroContent<T>(
  macro: Macro,
  data: string,
  validator?: Validator,
): T {
  if (!macro.schema) {
    throw new Error(`Macro ${macro.name} does not have a schema`);
  }
  return validateJson<T>(JSON.parse(data), macro.schema, validator);
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
  try {
    return handlebars.compile(content, {
      strict: true,
    })({});
  } catch (err) {
    return handleMacroError(err, {
      name: '',
      tagName: '',
      handleStatic: () => '',
      handleInject: () => '',
    });
  }
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
export function handleMacroError(error: unknown, macro: Macro): string {
  let message = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  if (error instanceof DHValidationError) {
    message = `Check json syntax of macro ${macro.name}: ${error.errors?.map((e) => e.message).join(', ')}`;
  }
  if (
    typeof error === 'object' &&
    error != null &&
    'lineNumber' in error &&
    typeof error.lineNumber === 'number'
  ) {
    message += ` at line ${error.lineNumber}`;
  }
  return createAdmonition('WARNING', 'Macro Error', message);
}

/**
 *
 */
export function createHtmlPlaceholder(
  macro: Macro,
  options: Record<string, string | undefined>,
) {
  // Key value pairs are shown using the key as the attribute name and the value as the attribute value
  // Values are wrapped in quotes to prevent issues with special characters
  const optionString = Object.keys(options)
    .map((key) => `${key}="${options[key]}"`)
    .join(' ');

  return `++++\n<${macro.tagName}${optionString ? ` ${optionString}` : ''}></${macro.tagName}>\n++++`;
}

/**
 * Creates an adoc admonition
 * @param type - The type of admonition
 * @param label - The label of the admonition
 * @param content - The content of the admonition
 * @returns The adoc admonition as a string
 */
export function createAdmonition(
  type: AdmonitionType,
  label: string,
  content: string,
) {
  return `[${type}]\n.${label}\n====\n${content}\n====\n\n`;
}
