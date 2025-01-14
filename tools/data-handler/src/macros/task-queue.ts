import { MacroTaskState } from '../interfaces/macros.js';

/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

export default class TaskQueue {
  private tasks: MacroTaskState[] = [];

  public push(t: MacroTaskState) {
    this.tasks.push(t);
  }

  public find(globalId: string, localId: number) {
    return this.tasks.find(
      (task) => task.globalId === globalId && task.localId === localId,
    );
  }

  public async waitAll() {
    for (const task of this.tasks) {
      await task.promise;
    }
  }

  public async waitTask(t: MacroTaskState) {
    await t.promise;
  }

  public async wait(globalId: string, localId: number) {
    const task = this.find(globalId, localId);
    if (!task) {
      throw new Error('Tried to wait a task that does not exist');
    }
    return this.waitTask(task);
  }

  public async reset() {
    this.tasks = [];
  }
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
