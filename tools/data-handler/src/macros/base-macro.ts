/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import type {
  HandlebarsOptions,
  MacroGenerationContext,
  MacroMetadata,
  MacroTaskState,
} from '../interfaces/macros.js';
import { generateRandomString } from '../utils/random.js';
import { MacroError } from '../exceptions/index.js';
import type TaskQueue from './task-queue.js';
import { ClingoError } from '@cyberismo/node-clingo';
import { getChildLogger } from '../utils/log-utils.js';

abstract class BaseMacro {
  private globalId: string;
  private localCounter: number = 0;

  // Macros share the same logger
  protected get logger() {
    return getChildLogger({
      module: 'macro',
      macro: this.macroMetadata.name,
    });
  }

  constructor(
    protected macroMetadata: MacroMetadata,
    private readonly tasks: TaskQueue,
  ) {
    // Set a unique global id for each instance of the macro
    this.globalId = `${generateRandomString(36, 10)}`;
  }

  // Default: exportSite uses inject output unless overridden by subclass
  protected handleStaticSite(
    context: MacroGenerationContext,
    input: unknown,
  ): Promise<string> {
    return this.handleInject(context, input);
  }

  // Default: inject uses static output unless overridden by subclass
  protected handleInject(
    context: MacroGenerationContext,
    input: unknown,
  ): Promise<string> {
    return this.handleStatic(context, input);
  }

  protected abstract handleStatic(
    context: MacroGenerationContext,
    input: unknown,
  ): Promise<string>;

  protected abstract handleValidate(
    context: MacroGenerationContext,
    input: unknown,
  ): void;

  public get metadata() {
    return this.macroMetadata;
  }

  private findDependencies(input: string): MacroTaskState[] {
    // Define a regex pattern to identify dependencies in the input string.
    const dependencyPattern = /<<macro::([a-zA-Z0-9_-]+)::([0-9]+)>>/g;

    const dependencies: MacroTaskState[] = [];

    let match;
    while ((match = dependencyPattern.exec(input)) !== null) {
      const [placeholder, globalId, localId] = match;

      // Retrieve the task corresponding to the globalId and localId
      const task = this.tasks.find(globalId, parseInt(localId, 10));

      if (task) {
        dependencies.push(task);
      } else {
        this.logger.warn(
          `Dependency not found for placeholder: ${placeholder} (globalId: ${globalId}, localId: ${localId})`,
        );
      }
    }

    return dependencies;
  }

  private generatePlaceholder() {
    const localId = this.localCounter++;
    return {
      localId,
      placeholder: `<<macro::${this.globalId}::${localId}>>`,
    };
  }

  private findTask(globalId: string, localId: number) {
    const task = this.tasks.find(globalId, localId);
    if (!task) {
      this.logger.warn(
        `Task not found for global id ${globalId}, local id ${localId}.`,
      );
    }
    return task;
  }

  /**
   * Function responsible for starting the promise and storing it along with its localId.
   */
  public invokeMacro = (
    context: MacroGenerationContext,
    options: HandlebarsOptions,
  ) => {
    // Create a unique localId for each invocation
    const { placeholder, localId } = this.generatePlaceholder();

    const rawInput = options.fn(this);
    let input = '{' + rawInput + '}';

    if (context.mode === 'validate') {
      try {
        this.handleValidate(context, JSON.parse(input));
      } catch (error) {
        if (error instanceof Error) {
          const errorMessage = `From card '${context.cardKey}' a macro validation error:\n\n${error.message}.\n\nCard content:\n ${input}`;
          throw new Error(errorMessage);
        }
        throw error;
      }
      return;
    }

    // Extract dependencies
    const dependencies = this.findDependencies(rawInput);

    // Create a promise to resolve dependencies, execute the macro, and handle the results
    const promise = Promise.allSettled(dependencies.map((dep) => dep.promise))
      .then(() => {
        for (const dependency of dependencies) {
          if (dependency.error) {
            const task = this.findTask(this.globalId, localId);
            if (task) {
              // There could be a better way, but multi-nested macros are rare
              task.error = new MacroError(
                dependency.error.message,
                context.cardKey,
                this.metadata.name,
                dependency.error.context.parameters,
                {
                  macroName: dependency.macro,
                  parameters: dependency.parameters,
                },
              );
            }
            return;
          }
          input = input.replace(
            dependency.placeholder,
            dependency.promiseResult || '',
          );
          // parse json after each dep, so we know the exact macro which produced the error
          try {
            JSON.parse(input);
          } catch {
            const task = this.findTask(this.globalId, localId);
            if (task) {
              task.error = new MacroError(
                'Invalid JSON produced by macro dependency',
                context.cardKey,
                this.metadata.name,
                input,
                {
                  macroName: dependency.macro,
                  parameters: dependency.parameters,
                  output: input,
                },
              );
            }
            return;
          }
        }
        // This will never throw in practice, thus no need to catch
        const parsed = JSON.parse(input);

        // Select the function to execute based on context mode
        const functionToCall =
          context.mode === 'inject'
            ? this.handleInject
            : context.mode === 'staticSite'
              ? this.handleStaticSite
              : this.handleStatic;

        // Execute the function and handle its result
        return functionToCall.call(this, context, parsed);
      })
      .then((result) => {
        // undefined is used to indicate that the macro did not run for some reason
        if (result === undefined) {
          return;
        }
        const task = this.findTask(this.globalId, localId);
        if (task) {
          task.promiseResult = result;
        }
      })
      .catch((err) => {
        if (!(err instanceof Error)) {
          this.logger.error(err, 'Unknown error');
          err = new Error('Unknown error');
        }
        const message =
          err instanceof ClingoError
            ? err.details.errors.join('\n')
            : err.message;
        const error =
          err instanceof MacroError
            ? err
            : new MacroError(
                message,
                context.cardKey,
                this.metadata.name,
                input,
              );

        const task = this.findTask(this.globalId, localId);
        if (task) {
          task.error = error;
        }
      });

    // Store the task
    this.tasks.push({
      globalId: this.globalId,
      localId,
      promise,
      placeholder,
      promiseResult: null,
      macro: this.macroMetadata.name,
      parameters: rawInput,
      error: null,
    });
    // Return the placeholder
    return placeholder;
  };
}

export default BaseMacro;
