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
  ChangeSetManager,
  CommandManager,
  type ProjectProvider,
} from '@cyberismo/data-handler';
import { ProjectEvents } from './domain/events/project-events.js';
import { changeSetsDirFromEnv } from './utils.js';

// An open changeSet unused this long is closed; its worktree stays.
const CHANGESET_IDLE_MS = 15 * 60 * 1000;
const CHANGESET_IDLE_CHECK_MS = 60 * 1000;

export type ProjectRegistryEntry = {
  prefix: string;
  commands: CommandManager;
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
  private projects: Map<string, CommandManager> = new Map();
  private events = new Map<CommandManager, ProjectEvents>();
  private changeSets = new Map<CommandManager, ChangeSetManager>();
  // CommandManagers of the changeSets open now
  private changeSetCommands = new Set<CommandManager>();
  private idleTimer: ReturnType<typeof setInterval> | undefined;
  readonly options: ConstructorParameters<typeof CommandManager>[1];

  constructor(
    entries: ProjectRegistryEntry[] = [],
    options?: ConstructorParameters<typeof CommandManager>[1],
  ) {
    this.options = options;
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

  eventsFor(commands: CommandManager): ProjectEvents {
    let events = this.events.get(commands);
    if (!events) {
      if (
        ![...this.projects.values()].includes(commands) &&
        !this.changeSetCommands.has(commands)
      ) {
        throw new Error('Project is not registered');
      }
      events = new ProjectEvents(commands.project);
      this.events.set(commands, events);
    }
    return events;
  }

  /**
   * The changeSets of a registered project. Open changeSets unused for a
   * while are closed, together with their event streams.
   */
  changeSetsFor(commands: CommandManager): ChangeSetManager {
    let manager = this.changeSets.get(commands);
    if (!manager) {
      if (![...this.projects.values()].includes(commands)) {
        throw new Error('Project is not registered');
      }
      manager = new ChangeSetManager(commands, {
        worktreesRoot: changeSetsDirFromEnv(),
        onClose: (_id, closed) => {
          this.changeSetCommands.delete(closed);
          this.events.get(closed)?.dispose();
          this.events.delete(closed);
        },
      });
      this.changeSets.set(commands, manager);
      this.idleTimer ??= setInterval(() => {
        for (const changeSets of this.changeSets.values()) {
          changeSets.closeIdle(CHANGESET_IDLE_MS);
        }
      }, CHANGESET_IDLE_CHECK_MS);
      this.idleTimer.unref();
    }
    return manager;
  }

  /**
   * The CommandManager serving one of a project's changeSets, opening it if
   * needed.
   * @throws ChangeSetNotFoundError, ChangeSetClosedError
   */
  async openChangeSet(
    commands: CommandManager,
    id: string,
  ): Promise<CommandManager> {
    const changeSet = await this.changeSetsFor(commands).open(id);
    this.changeSetCommands.add(changeSet);
    return changeSet;
  }

  list(): ProjectListItem[] {
    return Array.from(this.projects.entries()).map(([prefix, commands]) => ({
      prefix,
      name: commands.project.configuration.name,
      category: commands.project.configuration.category || undefined,
      description: commands.project.configuration.description || undefined,
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
    clearInterval(this.idleTimer);
    this.idleTimer = undefined;
    for (const changeSets of this.changeSets.values()) {
      changeSets.dispose();
    }
    this.changeSets.clear();
    for (const events of this.events.values()) {
      events.dispose();
    }
    this.events.clear();
    for (const commands of this.projects.values()) {
      commands.project.dispose();
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
      this.add(entry.prefix, entry.commands);
    }
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
    return new ProjectRegistry(entries, options);
  }
}
