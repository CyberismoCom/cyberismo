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

import {
  openCheckout,
  type Checkout,
  type ProjectProvider,
  type WorkspaceOptions,
} from '@cyberismo/data-handler';
import { ProjectEvents } from './domain/events/project-events.js';
import type { ProjectErrors } from '@cyberismo/model';

export type ProjectRegistryEntry = {
  prefix: string;
  checkout: Checkout;
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
  private projects: Map<string, Checkout> = new Map();
  private events = new Map<Checkout, ProjectEvents>();
  readonly options: WorkspaceOptions | undefined;

  constructor(
    entries: ProjectRegistryEntry[] = [],
    options?: WorkspaceOptions,
  ) {
    this.options = options;
    for (const entry of entries) {
      this.add(entry.prefix, entry.checkout);
    }
  }

  get(prefix: string): Checkout | undefined {
    return this.projects.get(prefix);
  }

  has(prefix: string): boolean {
    return this.projects.has(prefix);
  }

  add(prefix: string, checkout: Checkout): void {
    if (this.projects.has(prefix)) {
      throw new Error(`Project '${prefix}' is already registered`);
    }
    this.projects.set(prefix, checkout);
  }

  eventsFor(checkout: Checkout): ProjectEvents {
    let events = this.events.get(checkout);
    if (!events) {
      if (![...this.projects.values()].includes(checkout)) {
        throw new Error('Project is not registered');
      }
      events = new ProjectEvents();
      this.events.set(checkout, events);
    }
    return events;
  }

  list(): ProjectListItem[] {
    return Array.from(this.projects.entries()).map(([prefix, checkout]) => ({
      prefix,
      name: checkout.configuration.name,
      category: checkout.configuration.category || undefined,
      description: checkout.configuration.description || undefined,
    }));
  }

  /** Iterate over all registered checkouts. */
  values(): IterableIterator<Checkout> {
    return this.projects.values();
  }

  first(): Checkout | undefined {
    const [first] = this.projects.values();
    return first;
  }

  dispose(): void {
    for (const events of this.events.values()) {
      events.dispose();
    }
    this.events.clear();
    for (const checkout of this.projects.values()) {
      checkout.dispose();
    }
    this.projects.clear();
  }

  /**
   * Replace all registered projects atomically. Disposes existing
   * checkouts, then installs the new entries. Used by the test-mode
   * reset endpoint to swap project state without restarting the Hono app.
   */
  async replace(entries: ProjectRegistryEntry[]): Promise<void> {
    this.dispose();
    for (const entry of entries) {
      this.add(entry.prefix, entry.checkout);
    }
  }

  /**
   * Create a single-project registry from a checkout.
   * Used by export mode and tests where only one project is needed.
   */
  static fromCheckout(checkout: Checkout): ProjectRegistry {
    return new ProjectRegistry([
      { prefix: checkout.configuration.cardKeyPrefix, checkout },
    ]);
  }

  /**
   * Build a registry from scanned project entries, opening each checkout.
   * A project that fails to load is left out and reported in `failed`.
   */
  static async fromScannedProjects(
    projects: ScannedProject[],
    options?: WorkspaceOptions,
  ): Promise<{ registry: ProjectRegistry; failed: ProjectErrors[] }> {
    const entries: ProjectRegistryEntry[] = [];
    const failed: ProjectErrors[] = [];
    for (const project of projects) {
      try {
        const checkout = await openCheckout(project.path, options);
        entries.push({ prefix: project.prefix, checkout });
      } catch (error) {
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
