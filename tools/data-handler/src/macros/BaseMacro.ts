/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { MacroGenerationContext, MacroMetadata, MacroTaskState } from '../interfaces/macros.js';
import { handleMacroError } from './index.js';

abstract class BaseMacro {
  /**
   * Used for identifying the macro globally.
   * This should be async safe.
   */
  private static globalCounter = 0;

  private globalId: string;
  private tasks: MacroTaskState[] = [];

  constructor(protected macroMetadata: MacroMetadata) {
    // Set a unique global id for each instance of the macro, based on the macro name
    this.globalId = `${this.macroMetadata.name}-${BaseMacro.globalCounter++}`;
  }

  protected abstract handleStatic(
    context: MacroGenerationContext,
    input: string,
  ): Promise<string>;

  protected abstract handleInject(
    context: MacroGenerationContext,
    input: string,
  ): Promise<string>;

  public get metadata() {
    return this.macroMetadata;
  }

  /**
   * Function responsible for starting the promise and storing it along with its localId.
   */
  public invokeMacro = (context: MacroGenerationContext, input: string) => {
    // Create a unique localId for each invocation
    const localId = this.tasks.length;
    const placeholder = `${this.globalId}-${localId}`;

    const functionToCall =
      context.mode === 'inject' ? this.handleInject : this.handleStatic;

    // Create the promise for this particular invocation and store it
    const promise = functionToCall(context, input)
      .then((res) => {
        const item = this.tasks.find((p) => p.localId === localId);
        if (item) {
          item.promiseResult = res;
        } else {
          console.error(`After finishing execution, macro ${this.metadata.name} with local id ${localId} couldn't find itself. This is likely an issue with the cyberismo data-handler itself.`)
        }
      })
      .catch((err) => {
        const item = this.tasks.find((p) => p.localId === localId);
        if (item) {
          item.promiseResult = handleMacroError(err, this.metadata);
        } else {
          console.error(`After finishing execution, macro ${this.metadata.name} with local id ${localId} couldn't find itself. This is likely an issue with the cyberismo data-handler itself.`)
        }
      });

    // Add this invocation to the promise list
    this.tasks.push({
      localId,
      promise,
      placeholder,
      promiseResult: null,
    });

    // Return the unique placeholder for this invocation
    return placeholder;
  };

  /**
   * This method is responsible for resolving all the promises and replacing
   * each corresponding placeholder with the actual resolved value.
   */
  public applyMacroResults = async (input: string) => {
    // Wait for all promises to resolve
    await Promise.all(this.tasks.map((p) => p.promise));

    // Replace placeholders with their corresponding results
    let result = input;
    for (const item of this.tasks) {
      if (item.promiseResult === null) {
        result = handleMacroError(
          new Error(
            `Tried to access result before it was resolved for ${item.placeholder}`,
          ),
          this.metadata,
        );
      } else {
        result = result.replace(item.placeholder, item.promiseResult);
      }
    }

    // Reset the promise list for future invocations
    this.tasks = [];

    return result;
  };
}

export default BaseMacro;
