export type AllowedClingoType = string | number | boolean;

export type NestedBuilder = (builder: ClingoFactBuilder) => ClingoFactBuilder;

export type ClingoArgument =
  | AllowedClingoType
  | AllowedClingoType[]
  | NestedBuilder
  | ClingoFactBuilder;

type ClingoArgumentInternal =
  | AllowedClingoType
  | AllowedClingoType[]
  | ClingoFactBuilder;

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

  constructor(predicate: string, end: string = '.') {
    this.predicate = predicate;
    this.end = end;
  }

  /**
   * Adds an argument, which is any value
   * @param arg
   * @returns
   */
  addArgument(arg: ClingoArgument | null): ClingoFactBuilder {
    if (arg === null) {
      return this;
    }
    if (typeof arg === 'function') {
      const nestedBuilder = new ClingoFactBuilder('', '');
      this.arguments.push(arg(nestedBuilder));
    } else if (arg instanceof ClingoFactBuilder) {
      this.arguments.push(arg);
    } else {
      this.arguments.push(arg);
    }
    return this;
  }

  /**
   * Helper for adding multiple arguments, because it's common
   * @param args
   * @returns
   */
  addArguments(...args: (ClingoArgument | null)[]): ClingoFactBuilder {
    args.forEach((arg) => this.addArgument(arg));
    return this;
  }

  /**
   * Adds a literal argument, which means that it will not have quotes
   * @param literal
   * @returns
   */
  addLiteralArgument(literal: string): ClingoFactBuilder {
    this.arguments.push(new LiteralBuildler(literal));
    return this;
  }

  /**
   * Helper for adding multiple literal arguments, because it's common
   * @param literal
   * @returns
   */
  addLiteralArguments(...literals: string[]): ClingoFactBuilder {
    literals.forEach((literal) => this.addLiteralArgument(literal));
    return this;
  }

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
      return value.toString();
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

class LiteralBuildler extends ClingoFactBuilder {
  build() {
    return this.predicate;
  }
}
