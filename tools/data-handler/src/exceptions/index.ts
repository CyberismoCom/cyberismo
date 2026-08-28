/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import type { ValidationError } from 'json-schema';

export class DHValidationError extends Error {
  public errors?: ValidationError[];
  constructor(message: string, errors?: ValidationError[]) {
    super(message);
    this.name = 'DHValidationError';
    this.errors = errors;
  }
}

export class SchemaNotFound extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaNotFound';
  }
}

export class CardNotFoundError extends Error {
  constructor(cardKey: string) {
    super(`Card '${cardKey}' does not exist in the project`);
  }
}

/**
 * Thrown while loading cards when a card key is not unique. Keys must be
 * unique across the project and all of its templates, so loading cannot pick
 * a winner: the condition has to reach the caller.
 */
export class DuplicateCardKeyError extends Error {
  constructor(public readonly cardKeys: string[]) {
    super(`Duplicate card keys found: ${cardKeys.join(', ')}`);
    this.name = 'DuplicateCardKeyError';
  }
}
/**
 * Stores the context of a macro error that originated from another macro
 */
export interface MacroDependency {
  macroName: string;
  parameters: string;
  output?: string;
}
/**
 * Thrown when a macro fails to execute.
 */
export class MacroError extends Error {
  public context: {
    cardKey: string;
    macroName: string;
    parameters: string;
    dependency?: MacroDependency;
  };

  constructor(
    message: string,
    cardKey: string,
    macroName: string,
    parameters: string,
    dependency?: MacroDependency,
  ) {
    super(message);
    this.name = 'MacroError';
    this.context = {
      cardKey,
      macroName,
      parameters,
      dependency,
    };
  }
}
