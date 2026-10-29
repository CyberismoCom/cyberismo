// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
      const held = new ProjectEvents(ws.changes);
      this.events.set(prefix, held);
      // An event names the project's prefix once its write is done, so a
      // rename is followed as the directory follows it.
      ws.changes.subscribe(({ project }) => this.follow(held, project));
      events = held;
    }
    return events;
  }

  // Keeps `events` under `prefix`, its project's prefix now, unless another
  // project's events hold it.
  private follow(events: ProjectEvents, prefix: string) {
    if (this.events.has(prefix)) {
      return;
    }
    for (const [key, held] of this.events) {
      if (held === events) {
        this.events.delete(key);
        this.events.set(prefix, events);
        return;
      }
    }
  }

  /** Disposes the project's events, closing their connections. */
  drop(prefix: string) {
    this.events.get(prefix)?.dispose();
    this.events.delete(prefix);
  }
}
