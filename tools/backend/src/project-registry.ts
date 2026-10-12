/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { Workspace, type ProjectProvider } from '@cyberismo/data-handler';
import { ProjectEvents } from './domain/events/project-events.js';
import type { ProjectErrors } from './project-errors.js';

export type ProjectRegistryEntry = {
  prefix: string;
  ws: Workspace;
};

export type ProjectListItem = {
  prefix: string;
  name: string;
  category?: string;
  description?: string;
};

/** Minimal project descriptor returned by scanForProjects. */
export interface ScannedProject {
  path: string;
  prefix: string;
  name: string;
}

export class ProjectRegistry implements ProjectProvider {
  private projects: Map<string, Workspace> = new Map();
  private events = new Map<Workspace, ProjectEvents>();
  readonly options: ConstructorParameters<typeof Workspace>[1];

  constructor(
    entries: ProjectRegistryEntry[] = [],
    options?: ConstructorParameters<typeof Workspace>[1],
  ) {
    this.options = options;
    for (const entry of entries) {
      this.add(entry.prefix, entry.ws);
    }
  }

  get(prefix: string): Workspace | undefined {
    return this.projects.get(prefix);
  }

  has(prefix: string): boolean {
    return this.projects.has(prefix);
  }

  add(prefix: string, ws: Workspace): void {
    if (this.projects.has(prefix)) {
      throw new Error(`Project '${prefix}' is already registered`);
    }
    this.projects.set(prefix, ws);
  }

  eventsFor(ws: Workspace): ProjectEvents {
    let events = this.events.get(ws);
    if (!events) {
      if (![...this.projects.values()].includes(ws)) {
        throw new Error('Project is not registered');
      }
      events = new ProjectEvents();
      this.events.set(ws, events);
    }
    return events;
  }

  list(): ProjectListItem[] {
    return Array.from(this.projects.entries()).map(([prefix, ws]) => ({
      prefix,
      name: ws.checkout.configuration.name,
      category: ws.checkout.configuration.category || undefined,
      description: ws.checkout.configuration.description || undefined,
    }));
  }

  /** Iterate over all registered CommandManagers. */
  values(): IterableIterator<Workspace> {
    return this.projects.values();
  }

  first(): Workspace | undefined {
    const [first] = this.projects.values();
    return first;
  }

  dispose(): void {
    for (const events of this.events.values()) {
      events.dispose();
    }
    this.events.clear();
    for (const ws of this.projects.values()) {
      ws.checkout.dispose();
    }
    this.projects.clear();
  }

  /**
   * Replace all registered projects atomically. Disposes existing
   * CommandManagers, then installs the new entries. Used by the test-mode
   * reset endpoint to swap project state without restarting the Hono app.
   */
  async replace(entries: ProjectRegistryEntry[]): Promise<void> {
    this.dispose();
    for (const entry of entries) {
      this.add(entry.prefix, entry.ws);
    }
  }

  /**
   * Create a single-project registry from a CommandManager.
   * Used by export mode and tests where only one project is needed.
   */
  static fromCommandManager(ws: Workspace): ProjectRegistry {
    return new ProjectRegistry([
      { prefix: ws.checkout.configuration.cardKeyPrefix, ws },
    ]);
  }

  /**
   * Build a registry from scanned project entries, initializing each CommandManager.
   * A project that fails to load is left out and reported in `failed`.
   */
  static async fromScannedProjects(
    projects: ScannedProject[],
    options?: ConstructorParameters<typeof Workspace>[1],
  ): Promise<{ registry: ProjectRegistry; failed: ProjectErrors[] }> {
    const entries: ProjectRegistryEntry[] = [];
    const failed: ProjectErrors[] = [];
    for (const project of projects) {
      let ws: Workspace | undefined;
      try {
        ws = new Workspace(project.path, options);
        await ws.initialize();
        entries.push({ prefix: project.prefix, ws });
      } catch (error) {
        ws?.checkout.dispose();
        failed.push({
          prefix: project.prefix,
          errors: [
            `Failed to load project (${project.path}): ${
              error instanceof Error ? error.message : String(error)
            }`,
          ],
        });
      }
    }
    return { registry: new ProjectRegistry(entries, options), failed };
  }
}
