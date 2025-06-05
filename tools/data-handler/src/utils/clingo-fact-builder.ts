import { INT32_MAX } from './constants.js';
import { getChildLogger } from './log-utils.js';

/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
export type AllowedClingoType = string | number | boolean;

export type NestedBuilder = (builder: ClingoFactBuilder) => ClingoFactBuilder;

type ClingoArgumentInternal =
  | AllowedClingoType
  | AllowedClingoType[]
  | ClingoFactBuilder;

export type ClingoArgument = ClingoArgumentInternal | NestedBuilder;

/**
 * This function takes care of encoding chars, which might produce issues in clingo
 * This should be done for user provided values
 */
export function encodeClingoValue(value: string) {
  return value.replace(/[\n\\"]/g, (char) => {
    if (char === '\n') {
      return '\\n';
    }
    return `\\${char}`;
  });
}

export class ClingoFactBuilder {
  protected predicate: string;
  private end: string;
  private arguments: ClingoArgumentInternal[] = [];
  private get logger() {
    return getChildLogger({
      module: 'clingoFactBuilder',
    });
  }

  constructor(predicate: string, end: string = '.') {
    this.predicate = predicate;
    this.end = end;
  }

  /**
   * Adds an argument to the fact
   * @param arg Argument to add. If null, skipped
   * @returns this for chaining
   */
  addArgument(arg: ClingoArgument | null): ClingoFactBuilder {
    if (arg === null) {
      return this;
    }
    if (typeof arg === 'function') {
      const nestedBuilder = new ClingoFactBuilder('', '');
      this.arguments.push(arg(nestedBuilder));
    } else {
      this.arguments.push(arg);
    }
    return this;
  }

  /**
   * Helper for adding multiple arguments, because it's common
   * @param args
   * @returns this for chaining
   */
  addArguments(...args: (ClingoArgument | null)[]): ClingoFactBuilder {
    args.forEach((arg) => this.addArgument(arg));
    return this;
  }

  /**
   * Adds a literal argument, which means that it will not have quotes
   * @param literal The literal argument to add
   * @returns this for chaining
   */
  addLiteralArgument(literal: string): ClingoFactBuilder {
    this.arguments.push(new LiteralBuilder(literal));
    return this;
  }

  /**
   * Helper for adding multiple literal arguments, because it's common
   * @param literal
   * @returns this for chaining
   */
  addLiteralArguments(...literals: string[]): ClingoFactBuilder {
    literals.forEach((literal) => this.addLiteralArgument(literal));
    return this;
  }

  /**
   * Builds the clingo fact
   * @returns The clingo fact as a string
   */
  build(): string {
    const encodedArguments = this.arguments
      .map((arg) =>
        arg instanceof ClingoFactBuilder
          ? arg.build()
          : this.encodeArgument(arg),
      )
      .join(', ');

    return `${this.predicate}(${encodedArguments})${this.end}`;
  }

  // Function to get the raw value of the argument without encoding or quoting
  private getValue(value: AllowedClingoType | AllowedClingoType[]): string {
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    } else if (Array.isArray(value)) {
      // Array case, call getValue on each item without quotes
      return value.map((item) => this.getValue(item)).join(',');
    } else if (typeof value === 'number') {
      let floored = Math.floor(value);
      if (floored !== value) {
        this.logger.warn(
          {
            value,
          },
          'Expected a whole number, when transforming a number value to a clingo equivalent. Decimal part removed.',
        );
      }

      const exceedsInt32Max = floored > INT32_MAX;
      if (exceedsInt32Max || floored < -INT32_MAX) {
        this.logger.warn(
          {
            value,
          },
          `Value exceeds the 32-bit signed integer range. The value is too ${exceedsInt32Max ? 'large' : 'small'} to be represented as a 32-bit integer. Using ${exceedsInt32Max ? INT32_MAX : -INT32_MAX} instead.`,
        );
        floored = exceedsInt32Max ? INT32_MAX : -INT32_MAX;
      }
      return floored.toString();
    } else {
      return value;
    }
  }

  // Main encoding function, handling encoding and adding quotes if necessary
  private encodeArgument(arg: AllowedClingoType | AllowedClingoType[]): string {
    let processedValue = this.getValue(arg);

    if (typeof arg === 'string') {
      processedValue = encodeClingoValue(processedValue);
    }

    if (typeof arg === 'boolean' || typeof arg === 'number') {
      return processedValue;
    }

    return `"${processedValue}"`;
  }
}

class LiteralBuilder extends ClingoFactBuilder {
  build() {
    return this.predicate;
  }
}
