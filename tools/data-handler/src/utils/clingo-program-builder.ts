import { ClingoArgument, ClingoFactBuilder } from './clingo-fact-builder.js';

interface IBuilder {
  build(): string;
}

export class ClingoProgramBuilder {
  private rows: IBuilder[] = [];

  /**
   * Adds a new fact with a simple configuration.
   * @param predicate - The fact's predicate
   * @param args - The fact's arguments
   */
  addFact(predicate: string, ...args: ClingoArgument[]): ClingoProgramBuilder {
    const fact = new ClingoFactBuilder(predicate).addArguments(...args);
    this.rows.push(fact);
    return this;
  }

  /**
   * Adds a custom fact allowing use of the builder methods directly for more control.
   * @param predicate - The fact's predicate
   * @param configure - Function to configure the fact with builder methods
   */
  addCustomFact(
    predicate: string,
    configure: (builder: ClingoFactBuilder) => ClingoFactBuilder,
  ): ClingoProgramBuilder {
    const factBuilder = new ClingoFactBuilder(predicate);
    // Allow configuration of the fact
    this.rows.push(configure(factBuilder));
    return this;
  }
  /**
   * Adds an import to the clingo program
   */
  addImport(path: string): ClingoProgramBuilder {
    this.rows.push({ build: () => `#include "${path}".` });
    return this;
  }

  /**
   * Adds a comment
   */
  addComment(comment: string): ClingoProgramBuilder {
    this.rows.push({ build: () => `% ${comment}` });
    return this;
  }

  /**
   * Builds all facts and returns them as a single string with each fact on a new line.
   */
  buildAll(): string {
    return this.rows.map((row) => row.build()).join('\n') + '\n';
  }
}
