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
import graph from './graph/index.js';
import report from './report/index.js';
import scoreCard from './scoreCard/index.js';

import { validateJson } from '../utils/validate.js';
import { DHValidationError } from '../exceptions/index.js';
import { AdmonitionType } from '../interfaces/adoc.js';
import { Validator } from 'jsonschema';
import {
  MacroGenerationContext,
  MacroMetadata,
  MacroName,
} from '../interfaces/macros.js';
import BaseMacro from './base-macro.js';
import TaskQueue from './task-queue.js';

const CURLY_LEFT = '&#123;';
const CURLY_RIGHT = '&#125;';

export interface MacroConstructor {
  new (tasks: TaskQueue): BaseMacro; // Constructor signature
}

export const macros: { [K in MacroName]: MacroConstructor } = {
  createCards,
  graph,
  report,
  scoreCard,
};

export function validateMacroContent<T>(
  macro: MacroMetadata,
  data: unknown,
  validator?: Validator,
): T {
  if (!macro.schema) {
    throw new Error(`Macro ${macro.name} does not have a schema`);
  }

  try {
    return validateJson<T>(data, {
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
  tasks: TaskQueue,
) {
  const macroInstances: BaseMacro[] = [];
  for (const macro of Object.keys(macros) as MacroName[]) {
    const MacroClass = macros[macro];
    const macroInstance = new MacroClass(tasks);
    instance.registerHelper(macro, function (this: unknown, options) {
      if (
        this != null &&
        typeof this === 'object' &&
        '__isRaw' in this &&
        this.__isRaw
      ) {
        // we use escaped chars so that they will not be re-run
        return `${CURLY_LEFT}${CURLY_LEFT}#${macro}${CURLY_RIGHT}${CURLY_RIGHT}${options.fn(this)}${CURLY_LEFT}${CURLY_LEFT}/${macro}${CURLY_RIGHT}${CURLY_RIGHT}`;
      }
      return macroInstance.invokeMacro(context, options);
    });
    macroInstances.push(macroInstance);
  }

  instance.registerHelper('raw', function (options) {
    return options.fn({
      __isRaw: true,
    });
  });

  return macroInstances;
}
/**
 * Calculate amount of handlebars templates inside a string
 * @param input
 */
export function macroCount(input: string): number {
  const regex = /{{#.+}}/g;
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
    instance.registerHelper(macro, function (this: unknown, options) {
      return `{{#${macro}}}${options.fn(this)}{{/${macro}}}`;
    });
  }
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
  const tasks = new TaskQueue();
  registerMacros(handlebars, context, tasks);
  let result = content;
  while (maxTries-- > 0) {
    tasks.reset();
    const compiled = handlebars.compile(result, {
      strict: true,
    });
    try {
      result = compiled({});

      await tasks.waitAll();

      result = applyMacroResults(result, tasks, context);

      if (macroCount(result) === 0) {
        break;
      }
    } catch (err) {
      // This will produce a warning in the output in inject/static modes and throw an error in validate mode
      return handleMacroError(err, '', context);
    }
  }
  if (macroCount(result) !== 0) {
    return handleMacroError(
      new Error(`Too many recursive macro evaluations.`),
      '',
      context,
    );
  }
  return result.replaceAll(CURLY_LEFT, '{').replaceAll(CURLY_RIGHT, '}');
}

/**
 * This function assumes that tasks, which were started by macros, are complete.
 * It replaces the placeholders of the tasks with the actual results
 * @param input Adoc content, which might have macro placeholders
 * @param tasks The taskqueue, which was used to run the macros
 * @param context General context for the macro evaluation process
 * @returns Adoc, where placeholders have been replaced with the results.
 * Note that the results might include new macros.
 */
export function applyMacroResults(
  input: string,
  tasks: TaskQueue,
  context: MacroGenerationContext,
) {
  for (const item of tasks) {
    if (item.promiseResult === null) {
      input = handleMacroError(
        new Error(
          `Tried to access result before it was resolved for ${item.placeholder}`,
        ),
        item.macro,
        context,
      );
    } else {
      input = input.replace(item.placeholder, item.promiseResult);
    }
  }
  return input;
}

/**
 * Handles errors that come when handling macros
 * @param error - The error that was thrown
 * @param macro - The macro that caused the error
 * @returns The error message that is valid adoc
 */
export function handleMacroError(
  error: unknown,
  macro: string,
  context: MacroGenerationContext,
): string {
  let message = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
  if (error instanceof DHValidationError) {
    message = `Check json syntax of macro ${macro}: ${error.errors?.map((e) => e.message).join(', ')}`;
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

/**
 * Helper function for including base64 encoded images for now
 * @param image base64 encoded image
 * @returns valid asciidoc with the image
 */
export function createImage(image: string) {
  return `image::data:image/png;base64,${image}[]\n`;
}
