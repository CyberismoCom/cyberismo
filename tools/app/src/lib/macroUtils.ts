/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { macroMetadata } from '@cyberismo/data-handler/macros/common';

export interface ExtractedMacro {
  id: string;
  name: string;
  source: string;
  placeholder: string;
}

/**
 * Extracts all Handlebars macros from AsciiDoc content.
 * Macros use the format: {{#macroName}}...{{/macroName}}
 *
 * @param content - The raw AsciiDoc content
 * @returns Array of extracted macros with their source and placeholders
 */
export function extractMacros(content: string): ExtractedMacro[] {
  const macros: ExtractedMacro[] = [];
  const macroNames = Object.keys(macroMetadata);

  // Build a regex that matches all known macro types
  // Format: {{#macroName}}content{{/macroName}}
  for (const macroName of macroNames) {
    // Match the complete macro block including nested content
    // Using a non-greedy match to handle multiple macros of the same type
    const regex = new RegExp(
      `(\\{\\{#${macroName}\\}\\}[\\s\\S]*?\\{\\{/${macroName}\\}\\})`,
      'g'
    );

    let match;
    while ((match = regex.exec(content)) !== null) {
      const source = match[1];
      const id = `macro-${macroName}-${macros.length}-${Date.now()}`;
      macros.push({
        id,
        name: macroName,
        source,
        placeholder: `[[MACRO:${id}]]`,
      });
    }
  }

  return macros;
}

/**
 * Replaces macro source in content with placeholders.
 *
 * @param content - The raw AsciiDoc content
 * @param macros - The extracted macros
 * @returns Content with macros replaced by placeholders
 */
export function replaceMacrosWithPlaceholders(
  content: string,
  macros: ExtractedMacro[]
): string {
  let result = content;

  // Sort macros by source length (descending) to replace longer matches first
  // This prevents partial replacements when one macro contains another
  const sortedMacros = [...macros].sort(
    (a, b) => b.source.length - a.source.length
  );

  for (const macro of sortedMacros) {
    result = result.replace(macro.source, macro.placeholder);
  }

  return result;
}

/**
 * Restores macro sources from placeholders.
 *
 * @param content - Content with placeholders
 * @param macros - The extracted macros
 * @returns Content with placeholders replaced by original macro source
 */
export function restoreMacrosFromPlaceholders(
  content: string,
  macros: ExtractedMacro[]
): string {
  let result = content;

  for (const macro of macros) {
    result = result.replace(macro.placeholder, macro.source);
  }

  return result;
}

/**
 * Gets a map of macro IDs to their source code.
 * Useful for looking up macro sources by ID.
 *
 * @param macros - The extracted macros
 * @returns Map of macro ID to source
 */
export function getMacroSourceMap(
  macros: ExtractedMacro[]
): Map<string, string> {
  return new Map(macros.map((m) => [m.id, m.source]));
}
