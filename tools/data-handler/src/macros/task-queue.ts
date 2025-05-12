/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import type { MacroTaskState } from '../interfaces/macros.js';

export default class TaskQueue {
  private tasks: MacroTaskState[] = [];

  /**
   * Pushes a task to the task queue
   * @param task The task to push
   */
  public push(task: MacroTaskState) {
    this.tasks.push(task);
  }

  /**
   * Finds an existing task based on its id
   * @param globalId unique id across both macro classes and instances
   * @param localId Id within the instance
   * @returns task if found else undefined
   */
  public find(globalId: string, localId: number) {
    return this.tasks.find(
      (task) => task.globalId === globalId && task.localId === localId,
    );
  }

  /**
   * Waits for all tasks to be done
   */
  public async waitAll() {
    for (const task of this.tasks) {
      await task.promise;
    }
  }

  /**
   * Waits for a single task to be done
   * @param task task to wait
   */
  public async waitTask(task: MacroTaskState) {
    await task.promise;
  }

  /**
   * Removes all tasks. If they are running, they continue to run because they are promises
   */
  public async reset() {
    this.tasks = [];
  }

  /**
   * When iterating over task queue, it'll return each task
   */
  public [Symbol.iterator]() {
    let index = 0;
    const tasks = this.tasks;

    return {
      next(): IteratorResult<MacroTaskState> {
        if (index < tasks.length) {
          return { value: tasks[index++], done: false };
        } else {
          return { value: undefined, done: true };
        }
      },
    };
  }
}
