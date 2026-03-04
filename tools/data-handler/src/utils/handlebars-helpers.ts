/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
import Handlebars from 'handlebars';
import { escapeJsonString } from './json.js';
import { escapeCsvField } from './csv.js';
import { resourceName } from './resource-utils.js';

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
