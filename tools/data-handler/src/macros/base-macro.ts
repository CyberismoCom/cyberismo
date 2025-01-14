/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import {
  HandlebarsOptions,
  MacroGenerationContext,
  MacroMetadata,
  MacroTaskState,
} from '../interfaces/macros.js';
import { generateRandomString } from '../utils/random.js';
import { handleMacroError } from './index.js';
import TaskQueue from './task-queue.js';

abstract class BaseMacro {
  private readonly tasks: TaskQueue;

  private globalId: string;
  private localCounter: number = 0;

  constructor(
    protected macroMetadata: MacroMetadata,
    tasks: TaskQueue,
  ) {
    // Set a unique global id for each instance of the macro
    this.globalId = `${generateRandomString(36, 10)}`;
    this.tasks = tasks;
  }

  protected abstract handleValidate(input: unknown): void;

  protected abstract handleStatic(
    context: MacroGenerationContext,
    input: unknown,
  ): Promise<string>;

  protected abstract handleInject(
    context: MacroGenerationContext,
    input: unknown,
  ): Promise<string>;

  public get metadata() {
    return this.macroMetadata;
  }

  private generatePlaceholder() {
    const localId = this.localCounter++;
    return {
      localId,
      placeholder: `<<macro::${this.globalId}::${localId}>>`,
    };
  }

  private findDependencies(input: string): MacroTaskState[] {
    // Define a regex pattern to identify dependencies in the input string.
    // Customize this pattern to match your application's expected dependency format.
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
        console.warn(
          `Dependency not found for placeholder: ${placeholder} (globalId: ${globalId}, localId: ${localId})`,
        );
      }
    }

    return dependencies;
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
      this.handleValidate(JSON.parse(input));
      return;
    }

    // Extract dependencies
    const dependencies = this.findDependencies(rawInput);

    // Create a promise to resolve dependencies, execute the macro, and handle the results
    const promise = Promise.all(dependencies.map((dep) => dep.promise))
      .then(() => {
        for (const dependency of dependencies) {
          input = input.replace(
            dependency.placeholder,
            dependency.promiseResult || '',
          );
        }
        let parsed;
        try {
          parsed = JSON.parse(input);
        } catch {
          return 'Invalid JSON';
        }

        // Select the function to execute based on context mode
        const functionToCall =
          context.mode === 'inject' ? this.handleInject : this.handleStatic;

        // Execute the function and handle its result
        return functionToCall(context, parsed);
      })
      .then((result) => {
        const task = this.tasks.find(this.globalId, localId);
        if (task) {
          task.promiseResult = result;
        } else {
          console.error(
            `Task not found after execution: macro ${this.metadata.name}, local id ${localId}.`,
          );
        }
      })
      .catch((err) => {
        const task = this.tasks.find(this.globalId, localId);
        if (task) {
          task.promiseResult = handleMacroError(
            err,
            this.metadata.name,
            context,
          );
        } else {
          console.error(
            `Error handling task for macro ${this.metadata.name}, local id ${localId}:`,
            err,
          );
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
    });
    // Return the placeholder
    return placeholder;
  };
}

export default BaseMacro;
