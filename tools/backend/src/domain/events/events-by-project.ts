/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { SYSTEM_ACTOR, type ProjectDirectory } from '@cyberismo/data-handler';
import { ProjectEvents } from './project-events.js';

/**
 * The events of each project of a directory, by prefix. A project's events
 * follow its changes, read through a system handle, from first use.
 */
export class EventsByProject {
  private readonly events = new Map<string, ProjectEvents>();

  constructor(private readonly directory: ProjectDirectory) {}

  /**
   * The events of the project with `prefix`.
   * @throws ProjectNotFoundError if the directory has no such project.
   */
  async for(prefix: string): Promise<ProjectEvents> {
    const known = this.events.get(prefix);
    if (known) {
      return known;
    }
    const ws = await this.directory.open(prefix, SYSTEM_ACTOR);
    // Another request may have created them while this one waited.
    let events = this.events.get(prefix);
    if (!events) {
      events = new ProjectEvents(ws.changes);
      this.events.set(prefix, events);
    }
    return events;
  }

  /** Disposes the project's events, closing their connections. */
  drop(prefix: string) {
    this.events.get(prefix)?.dispose();
    this.events.delete(prefix);
  }
}
