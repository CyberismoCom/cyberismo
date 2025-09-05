/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import Handlebars from 'handlebars';

import createCards from './createCards/index.js';
import graph from './graph/index.js';
import image from './image/index.js';
import include from './include/index.js';
import report from './report/index.js';
import scoreCard from './scoreCard/index.js';
import xref from './xref/index.js';
import percentage from './percentage/index.js';
import vega from './vega/index.js';
import vegaLite from './vegalite/index.js';

import { validateJson } from '../utils/validate.js';
import { DHValidationError, MacroError } from '../exceptions/index.js';
import type { AdmonitionType } from '../interfaces/adoc.js';
import type {
  MacroGenerationContext,
  MacroMetadata,
  MacroName,
} from '../interfaces/macros.js';
import type BaseMacro from './base-macro.js';
import TaskQueue from './task-queue.js';
import { ClingoError } from '@cyberismo/node-clingo';
import type { Schema } from 'jsonschema';
const CURLY_LEFT = '&#123;';
const CURLY_RIGHT = '&#125;';
const RAW_BLOCK_OPEN = '{{#raw}}';
const RAW_BLOCK_CLOSE = '{{/raw}}';

/**
 * Pre-processes the content to handle {{#raw}} blocks by escaping all handlebars syntax inside them
 * @param content The template content to process
 * @returns The processed content with raw blocks escaped
 * @throws Error if nested raw blocks are found or if a raw block is not properly closed
 */
function preprocessRawBlocks(content: string): string {
  const result: string[] = [];
  let i = 0;

  // Helper function to check if a target string matches at a given position without creating substrings
  const matchesAt = (pos: number, target: string): boolean => {
    if (pos + target.length > content.length) return false;
    for (let k = 0; k < target.length; k++) {
      if (content[pos + k] !== target[k]) return false;
    }
    return true;
  };

  // Helper function to get line number at position
  const getLineNumber = (pos: number): number => {
    let lineNum = 1;
    for (let k = 0; k < pos; k++) {
      if (content[k] === '\n') {
        lineNum++;
      }
    }
    return lineNum;
  };

  while (i < content.length) {
    // Check for {{#raw}}
    if (matchesAt(i, RAW_BLOCK_OPEN)) {
      const openingLine = getLineNumber(i);
      // Find the matching {{/raw}} - no nesting allowed
      let j = i + RAW_BLOCK_OPEN.length;

      while (j < content.length) {
        if (matchesAt(j, RAW_BLOCK_OPEN)) {
          // Found nested raw block - not supported
          const nestedLine = getLineNumber(j);
          throw new Error(
            `Nested ${RAW_BLOCK_OPEN} blocks are not supported. Found nested raw block inside another raw block on line ${nestedLine} (original raw block started on line ${openingLine}).`,
          );
        } else if (matchesAt(j, RAW_BLOCK_CLOSE)) {
          // Found matching closing tag
          const rawContent = content.slice(i + RAW_BLOCK_OPEN.length, j);
          const escapedContent = rawContent
            .replaceAll('{', CURLY_LEFT)
            .replaceAll('}', CURLY_RIGHT);
          result.push(escapedContent);
          i = j + RAW_BLOCK_CLOSE.length;
          break;
        } else {
          j++;
        }
      }

      // If we reached the end without finding a closing tag
      if (j >= content.length) {
        throw new Error(
          `Unclosed ${RAW_BLOCK_OPEN} block found on line ${openingLine}. Every ${RAW_BLOCK_OPEN} must have a matching ${RAW_BLOCK_CLOSE}.`,
        );
      }
    } else {
      // Not a raw block, keep as-is
      result.push(content[i]);
      i++;
    }
  }

  return result.join('');
}

/**
 * Constructor for all macros except report macros
 */
export interface SimpleMacroConstructor {
  new (tasks: TaskQueue): BaseMacro;
}

/**
 * Constructor for report macros
 */
export interface ReportMacroConstructor {
  new (tasks: TaskQueue): BaseMacro;
}

/**
 * Constructor for all macros
 */
export type MacroConstructor = SimpleMacroConstructor | ReportMacroConstructor;

export const macros: {
  [K in MacroName]: MacroConstructor;
} = {
  createCards,
  graph,
  image,
  include,
  report,
  scoreCard,
  xref,
  percentage,
  vega,
  vegaLite,
};

/**
 * Validates the content inside a macro
 * @param macro - The macro to validate the content of
 * @param data - The data to validate
 * @param schema - Schema to use in validation
 * @returns The validated data
 */
export function validateMacroContent<T>(
  macro: MacroMetadata,
  data: unknown,
  schema?: Schema,
): T {
  if (!macro.schema) {
    throw new Error(`Macro ${macro.name} does not have a schema`);
  }

  try {
    return validateJson<T>(data, {
      schemaId: macro.schema,
      schema,
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
 * @param instance - Handlebar instance
 * @param context - The context for macro generation
 * @param tasks - Tasks to register
 * @returns macro instances
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
      return macroInstance.invokeMacro(context, options);
    });
    macroInstances.push(macroInstance);
  }

  return macroInstances;
}
/**
 * Calculate amount of handlebars templates inside a string
 * @param input - String to calculate templates from
 * @returns number of macros
 */
export function macroCount(input: string): number {
  const regex = /{{#[\w\s-]+?}}/g;
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
 * Handle the macros in the content.
 * @param content - The content to handle the macros in
 * @param context - The context for macro generation
 * @param preserveRawBlocks - If true, don't unescape raw blocks at the end (for nested evaluations)
 * @returns macro result
 */
export async function evaluateMacros(
  content: string,
  context: MacroGenerationContext,
  preserveRawBlocks: boolean = false,
) {
  const handlebars = Handlebars.create();
  const tasks = new TaskQueue();
  registerMacros(handlebars, context, tasks);
  let result = content;
  while ((context.maxTries ?? 10) > 0) {
    await tasks.reset();
    try {
      const compiled = handlebars.compile(preprocessRawBlocks(result), {
        strict: true,
      });
      result = compiled({ cardKey: context.cardKey });

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
  // Only unescape raw blocks if we're not preserving them for nested evaluations
  return preserveRawBlocks
    ? result
    : result.replaceAll(CURLY_LEFT, '{').replaceAll(CURLY_RIGHT, '}');
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
    if (item.error) {
      input = input.replace(
        item.placeholder,
        handleMacroError(item.error, item.macro, context),
      );
    } // It should not be possible that promiseResult is null if there never was an error
    // Unless the function itself returns null / undefined
    else if (item.promiseResult == null) {
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
 * @param context - General context for the macro evaluation process
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
  } else if (error instanceof MacroError) {
    const { cardKey, macroName, dependency } = error.context;
    message = `Macro error in card '${cardKey}' in macro '${macroName}':\n\n${error.message}.`;

    if (dependency) {
      message += `\n\nParameters:\n\n${context.mode === 'validate' ? dependency.parameters : createCodeBlock(dependency.parameters)}.\n\n${dependency.output ? `Output:\n\n${context.mode === 'validate' ? dependency.output : createCodeBlock(dependency.output)}` : ''}`;
    }
  } else if (error instanceof ClingoError) {
    message = `Error running logic program in macro '${macro}':${error.details.errors.join('\n')}`;
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

// This is used to generate unique keys for macros
// TODO: There might be a better way to do this
let macroCounter = 0;

/**
 * Converts object to base64
 * @param obj Object to convert
 * @returns base64 conversion (as a Buffer)
 */
function objectToBase64(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), 'utf-8').toString('base64');
}
/**
 * Creates a placeholder for a macro
 * Options are encoded as base64
 * @param macro - The macro to create a placeholder for
 * @param options - The options for the macro
 * @returns The placeholder for the macro
 */
export function createHtmlPlaceholder(macro: MacroMetadata, options: unknown) {
  const optionsBase64 = objectToBase64(options);
  return `\n\n++++\n<${macro.tagName} options="${optionsBase64}" key="macro-${macroCounter++}"></${macro.tagName}>\n++++\n\n`;
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
 * Creates a code block
 * @param content - The content of the code block
 * @returns The code block as a string
 */
export function createCodeBlock(content: string) {
  return `\n\n----\n${content}\n----\n\n`;
}

/**
 * Helper function for including base64 encoded images
 * @param image base64 encoded image
 * @param controls Add controls
 * @returns valid asciidoc with the image
 */
export function createImage(image: string, controls: boolean = true) {
  if (process.env.EXPORT_FORMAT) {
    return `image::data:image/svg+xml;base64,${image}[]\n`;
  } else {
    const svg = Buffer.from(image, 'base64').toString('utf-8');
    if (controls) {
      return `++++\n<div class="cyberismo-svg-wrapper" data-type="cyberismo-svg-wrapper">\n${svg}\n</div>\n++++\n`;
    } else {
      return `++++\n${svg}\n++++\n`;
    }
  }
}

/**
 * Creates a Handlebars macro block string with the given macro name and options.
 *
 * @param macro - The name of the macro to create (e.g., 'scoreCard', 'include').
 * @param options - The options object to be stringified and inserted as macro content.
 * @returns The Handlebars macro block as a string, e.g. {{#macro}}...{{/macro}}
 */
export function createMacro(macro: MacroName, options: unknown) {
  let optionsString = JSON.stringify(options, null, 0);
  if (optionsString.length > 1) {
    optionsString = optionsString.slice(1, -1);
  }
  return `{{#${macro}}}${optionsString}{{/${macro}}}`;
}
