/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
import type Handlebars from 'handlebars';
import { escapeJsonString } from './json.js';
import { escapeCsvField } from './csv.js';
import { resourceName } from './resource-utils.js';
import { encodeClingoValue } from './clingo-fact-builder.js';

/**
 * Formats a value from a logic program for use in graphviz
 * @param value - The value to format
 * @returns The formatted value
 */
function formatAttributeValue(value?: string) {
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
 * Checks if a field is a custom field
 * @param field - The field to check
 * @returns True if the field is a custom field, false otherwise
 */
function isCustomField(field: string) {
  try {
    const { type } = resourceName(field, true);
    return type === 'fieldTypes';
  } catch {
    return false;
  }
}

/**
 * Formats a value for display in a report
 * @param value - The value to format
 * @returns The formatted value
 */
function formatValue(value: unknown): string {
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return value.map((v) => formatValue(v)).join(', ');
    }
    if (
      value != null &&
      'displayValue' in value &&
      typeof value.displayValue === 'string'
    ) {
      return value.displayValue;
    }
    if (value != null && 'value' in value && typeof value.value === 'string') {
      return formatValue(value.value);
    }
    return JSON.stringify(value, null, 2);
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  return value?.toString() ?? '';
}

/**
 * Registers comparison helpers (eq and ne) with a Handlebars instance
 * @param instance handlebars instance
 */
export function registerComparisonHelpers(instance: typeof Handlebars) {
  instance.registerHelper('eq', (a: unknown, b: unknown) => a === b);
  instance.registerHelper('ne', (a: unknown, b: unknown) => a !== b);
}

/**
 * Registers helpers for templating Clingo source.
 *
 * `clingoEscape` escapes a string so it is safe to interpolate inside a
 * Clingo string literal (`"..."`), preserving newlines and quotes.
 * Use it with the triple-stash form: `"{{{clingoEscape value}}}"`.
 * @param instance handlebars instance
 */
export function registerClingoHelpers(instance: typeof Handlebars) {
  instance.registerHelper('clingoEscape', (value: unknown) =>
    typeof value === 'string' ? encodeClingoValue(value) : '',
  );
}

/**
 * Coerces a Handlebars helper argument into a finite number.
 * @param value - The value to coerce (a number or numeric string)
 * @returns The value as a finite number
 * @throws Error if the value is not a finite number
 */
function toNumber(value: unknown): number {
  const result = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(result)) {
    throw new Error(`Expected a number but got '${String(value)}'`);
  }
  return result;
}

/**
 * Extracts and coerces the numeric arguments passed to a variadic helper.
 * The final argument is always the Handlebars options object, so it is dropped.
 * @param args - The arguments Handlebars passed to the helper
 * @returns The leading arguments as finite numbers
 * @throws Error if fewer than two operands are given or a value is not numeric
 */
function numericArgs(args: unknown[]): number[] {
  const operands = args.slice(0, -1);
  if (operands.length < 2) {
    throw new Error('Expected at least two numeric operands');
  }
  return operands.map(toNumber);
}

/**
 * Registers basic math helpers with a Handlebars instance.
 *
 * These let report templates compute values inline without a logic program, in
 * both the query template and the content template. Arithmetic uses native
 * JavaScript numbers and helpers return numbers, so results are never quoted.
 * `divide` always performs normal (non-integer) division and throws on
 * divide-by-zero, which surfaces as an inline error where the report macro is
 * rendered. `round` rounds to the given number of decimal digits (0 by default).
 * @param instance handlebars instance
 */
export function registerMathHelpers(instance: typeof Handlebars) {
  instance.registerHelper('multiply', (...args: unknown[]) =>
    numericArgs(args).reduce((a, b) => a * b),
  );
  instance.registerHelper('add', (...args: unknown[]) =>
    numericArgs(args).reduce((a, b) => a + b),
  );
  instance.registerHelper(
    'subtract',
    (a: unknown, b: unknown) => toNumber(a) - toNumber(b),
  );
  instance.registerHelper('divide', (a: unknown, b: unknown) => {
    const divisor = toNumber(b);
    if (divisor === 0) {
      throw new Error('Division by zero');
    }
    return toNumber(a) / divisor;
  });
  instance.registerHelper('round', (...args: unknown[]) => {
    const operands = args.slice(0, -1);
    if (operands.length < 1) {
      throw new Error('Expected at least one numeric operand');
    }
    const value = toNumber(operands[0]);
    const digits = operands.length > 1 ? toNumber(operands[1]) : 0;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  });
  instance.registerHelper('max', (...args: unknown[]) =>
    Math.max(...numericArgs(args)),
  );
  instance.registerHelper('min', (...args: unknown[]) =>
    Math.min(...numericArgs(args)),
  );
}

/**
 * Registers report-specific helpers with a Handlebars instance
 * @param instance handlebars instance
 */
export function registerReportHelpers(instance: typeof Handlebars) {
  instance.registerHelper('formatAttributeValue', formatAttributeValue);
  instance.registerHelper('isCustomField', isCustomField);
  instance.registerHelper('formatValue', formatValue);
  instance.registerHelper('jsonEscape', escapeJsonString);
  instance.registerHelper('csvEscape', escapeCsvField);
}
