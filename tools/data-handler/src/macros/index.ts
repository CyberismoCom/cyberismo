/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import Handlebars from 'handlebars';
import createCards from './createCards/index.js';
import scoreCard from './scoreCard/index.js';
import report from './report/index.js';
import { validateJson } from '../utils/validate.js';
import { DHValidationError } from '../exceptions/index.js';
import { AdmonitionType } from '../interfaces/adoc.js';
import { Validator } from 'jsonschema';
import {
  MacroGenerationContext,
  MacroMetadata,
  MacroName,
} from '../interfaces/macros.js';
import BaseMacro from './BaseMacro.js';

export interface MacroConstructor {
  new (): BaseMacro; // Constructor signature
}

export const macros: { [K in MacroName]: MacroConstructor } = {
  createCards,
  scoreCard,
  report,
};

const emptyMacro = {
  name: '',
  tagName: '',
};

export function validateMacroContent<T>(
  macro: MacroMetadata,
  data: string,
  validator?: Validator,
): T {
  if (!macro.schema) {
    throw new Error(`Macro ${macro.name} does not have a schema`);
  }

  try {
    return validateJson<T>(JSON.parse(data), {
      schemaId: macro.schema,
      validator,
    });
  } catch (error) {
    let message = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    if (error instanceof DHValidationError) {
      message = `${error.errors?.map((e) => e.message).join(', ')}`;
    }
    throw new Error(`${macro.name} macro JSON validation error: ${message}`);
  }
}

/**
 * Registers the macros with Handlebars
 * @param {Mode} mode - The mode to register the macros in
 */
export function registerMacros(
  instance: typeof Handlebars,
  context: MacroGenerationContext,
) {
  const macroInstances: BaseMacro[] = [];
  for (const macro of Object.keys(macros) as MacroName[]) {
    const MacroClass = macros[macro];
    const macroInstance = new MacroClass();
    instance.registerHelper(macro, (data: string) =>
      macroInstance.invokeMacro(context, data),
    );
    macroInstances.push(macroInstance);
  }
  return macroInstances;
}
/**
 * Calculate amount of handlebars templates inside a string
 * @param input
 */
export function macroCount(input: string): number {
  const regex = /{{{.+}}}/g;
  const match = input.match(regex);
  return match ? match.length : 0;
}

/**
 * Registers macros as handlebars helpers, which just leaves the macros in the content
 * Can be used when your macro uses handlebars and handles content that might contain macros
 * The handleMacros function will handle recursive macros so do not execute them inside your macro
 * @param instance handlebars instance
 */
export function registerEmptyMacros(instance: typeof Handlebars) {
  for (const macro of Object.keys(macros) as MacroName[]) {
    instance.registerHelper(macro, (...args) => {
      let argString = '';
      // last is the options object so go through everything else
      for (let i = 0; i < args.length - 1; i++) {
        argString += `'${args[i]}'`;
      }
      return `{{{${macro}${argString ? ` ${argString}` : ''}}}}`;
    });
  }
}

/**
 * Registers any Handlebars helper functions that may be needed by sub-macros
 * @param instance handlebars instance
 */
export function registerMacroHelpers(instance: typeof Handlebars) {
  // Register a helper to create the parameters JSON string for the scoreCard macro
  // Usage: (scoreCardParams title value unit legend)
  instance.registerHelper('scoreCardParams', function (...args) {
    // Remove the options object from the arguments
    args.pop();

    // value argument should be a number
    const value = parseFloat(args[1]);

    if (args.length === 2) {
      return JSON.stringify({
        title: args[0],
        value: value,
      });
    }

    if (args.length === 3) {
      return JSON.stringify({
        title: args[0],
        value: value,
        unit: args[2],
      });
    }

    if (args.length === 4) {
      return JSON.stringify({
        title: args[0],
        value: value,
        unit: args[2],
        legend: args[3],
      });
    }

    throw new Error(
      'scoreCardParams: invalid arguments, please specify title and value and optionally unit and legend',
    );
  });
}

/**
 * Handle the macros in the content
 * @param content - The content to handle the macros in
 * @param mode - The mode to handle the macros in. Inject mode will generate injectable placeholders for the macros while static mode will generate valid adoc. Validate mode will only validate the macros syntax and throw errors in case of issues.
 */
export async function evaluateMacros(
  content: string,
  context: MacroGenerationContext,
  maxTries: number = 10,
) {
  const handlebars = Handlebars.create();
  const macroInstances = registerMacros(handlebars, context);
  let result = content;
  while (maxTries-- > 0) {
    const compiled = handlebars.compile(result, {
      strict: true,
    });
    try {
      result = compiled({});

      for (const macro of macroInstances) {
        result = await macro.applyMacroResults(result, context);
      }
      if (macroCount(result) === 0) {
        break;
      }
    } catch (err) {
      // This will produce a warning in the output in inject/static modes and throw an error in validate mode
      return handleMacroError(err, emptyMacro, context);
    }
  }
  if (macroCount(result) !== 0) {
    return handleMacroError(
      new Error(`Too many recursive macro evaluations.`),
      emptyMacro,
      context,
    );
  }
  return result;
}

/**
 * Handles errors that come when handling macros
 * @param error - The error that was thrown
 * @param macro - The macro that caused the error
 * @returns The error message that is valid adoc
 */
export function handleMacroError(
  error: unknown,
  macro: MacroMetadata,
  context: MacroGenerationContext,
): string {
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
  if (context.mode === 'validate') {
    throw new Error(message);
  } else {
    return createAdmonition('WARNING', 'Macro Error', message);
  }
}

/**
 * Creates an injectable placeholder for a macro
 * @param macro - The macro to create the placeholder for
 * @param options - Options will be passed to the html element as attributes
 */
export function createHtmlPlaceholder(
  macro: MacroMetadata,
  options: Record<string, string | number | undefined>,
) {
  // Key value pairs are shown using the key as the attribute name and the value as the attribute value
  // Values are wrapped in quotes to prevent issues with special characters
  const optionString = Object.keys(options)
    .map((key) => `${key}="${options[key]}"`)
    .join(' ');

  // start with a line change to ensure that passthrough ++++ is on its own line
  return `\n++++\n<${macro.tagName}${optionString ? ` ${optionString}` : ''}></${macro.tagName}>\n++++`;
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
