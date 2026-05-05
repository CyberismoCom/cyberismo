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

import { CommandManager, type ProjectProvider } from '@cyberismo/data-handler';

export type ProjectRegistryEntry = {
  prefix: string;
  commands: CommandManager;
};

export type ProjectListItem = {
  prefix: string;
  name: string;
};

/** Minimal project descriptor returned by scanForProjects. */
export interface ScannedProject {
  path: string;
  prefix: string;
  name: string;
}

export class ProjectRegistry implements ProjectProvider {
  private projects: Map<string, CommandManager> = new Map();

  constructor(entries: ProjectRegistryEntry[] = []) {
    for (const entry of entries) {
      this.add(entry.prefix, entry.commands);
    }
  }

  get(prefix: string): CommandManager | undefined {
    return this.projects.get(prefix);
  }

  has(prefix: string): boolean {
    return this.projects.has(prefix);
  }

  add(prefix: string, commands: CommandManager): void {
    if (this.projects.has(prefix)) {
      throw new Error(`Project '${prefix}' is already registered`);
    }
    this.projects.set(prefix, commands);
  }

  list(): ProjectListItem[] {
    return Array.from(this.projects.entries()).map(([prefix, commands]) => ({
      prefix,
      name: commands.project.configuration.name,
    }));
  }

  /** Iterate over all registered CommandManagers. */
  values(): IterableIterator<CommandManager> {
    return this.projects.values();
  }

  first(): CommandManager | undefined {
    const [first] = this.projects.values();
    return first;
  }

  dispose(): void {
    for (const commands of this.projects.values()) {
      commands.project.dispose();
    }
    this.projects.clear();
  }

  /**
   * Create a single-project registry from a CommandManager.
   * Used by export mode and tests where only one project is needed.
   */
  static fromCommandManager(commands: CommandManager): ProjectRegistry {
    return new ProjectRegistry([
      { prefix: commands.project.configuration.cardKeyPrefix, commands },
    ]);
  }

  /**
   * Build a registry from scanned project entries, initializing each CommandManager.
   */
  static async fromScannedProjects(
    projects: ScannedProject[],
    options?: ConstructorParameters<typeof CommandManager>[1],
  ): Promise<ProjectRegistry> {
    const entries: ProjectRegistryEntry[] = [];
    for (const project of projects) {
      const commands = new CommandManager(project.path, options);
      await commands.initialize();
      entries.push({ prefix: project.prefix, commands });
    }
    return new ProjectRegistry(entries);
  }
}
