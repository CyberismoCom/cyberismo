/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
import Handlebars from 'handlebars';
import type { Calculate } from '../commands/index.js';
import { registerEmptyMacros } from '../macros/index.js';

/**
 * Formats a value from a logic program for use to graphviz
 * @param value - The value to format
 * @returns The formatted value
 */
export function formatAttributeValue(value?: string) {
  if (!value) {
    return '';
  }
  // value is an html-like string
  if (value.length > 1 && value.startsWith('<') && value.endsWith('>')) {
    return value;
  }
  // value is a normal string and needs to be wrapped in quotes
  return `"${value}"`;
}

/**
 * Parameters for the core generation function
 */
interface GenerateReportContentParams {
  calculate: Calculate;
  contentTemplate: string;
  queryTemplate: string;
  options: Record<string, string>;
  graph?: boolean;
}

/**
 * Generates report content based on a report definition, project context, and options,
 * by utilizing the ReportRunner class.
 *
 * @param params - The parameters for report generation.
 * @returns The rendered report content as a string.
 * @throws Error if the report definition is invalid, schema validation fails, or logic program execution fails.
 */
export async function generateReportContent(
  params: GenerateReportContentParams,
): Promise<string> {
  const {
    calculate,
    contentTemplate,
    queryTemplate,
    graph,
    options, // Destructure options
  } = params;

  const handlebars = Handlebars.create();

  // Compile and execute the query template
  const template = handlebars.compile(queryTemplate, {
    strict: true,
  });

  const result = await calculate.runLogicProgram(template(options));

  if (result.error) {
    throw new Error(result.error);
  }
  // register empty macros so that other macros aren't touched yet
  registerEmptyMacros(handlebars);

  if (graph) {
    handlebars.registerHelper('formatAttributeValue', formatAttributeValue);
  }

  return handlebars.compile(contentTemplate)({
    ...options,
    ...result,
  });
}
