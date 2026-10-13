/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Argument, type Command } from 'commander';

import { Cmd, type CommandOptions } from '@cyberismo/data-handler';
import { type ModuleSettingFromHub, type UpdatePlan } from '@cyberismo/model';

import {
  CommandGroup,
  CommandWithPath,
  parseSourceAtVersion,
} from '../lib/args.js';
import { commandHandler, credentials, program } from '../lib/dispatch.js';
import { openProject } from '../lib/open.js';
import { deprecationNote, handleResponse } from '../lib/output.js';
import { select } from '../lib/prompts.js';
import { renderUpdatePlan } from '../update-plan-lines.js';
import { removeAction } from './remove.js';
import { showAction } from './show.js';

// Helper to get modules that have not been imported.
export async function importableModules(options: CommandOptions<'show'>) {
  const copyOptions = Object.assign({}, options);
  copyOptions.details = true;
  const importableModules = await commandHandler.command(
    Cmd.show,
    ['importableModules'],
    copyOptions,
  );

  if (
    !importableModules?.payload ||
    (importableModules.payload as ModuleSettingFromHub[]).length === 0
  ) {
    program.error('No modules available');
  }

  // return potential importable modules
  const choices =
    (importableModules.payload as ModuleSettingFromHub[])?.map((module) => ({
      name: module.displayName ? module.displayName : module.name,
      value: module,
    })) || [];
  return choices;
}

export async function moduleInstallAction(
  source: string,
  useCredentials: boolean,
  options: CommandOptions<'import'>,
) {
  const { source: parsedSource, version } = source
    ? parseSourceAtVersion(source)
    : { source: undefined, version: undefined };

  let resolvedSource = parsedSource;
  let resolvedUseCredentials = useCredentials;

  if (!parsedSource) {
    // Interactive mode: show importable modules
    try {
      const choices = await importableModules(options);
      const selectedModule = await select({
        message: 'Select a module to import:',
        choices,
      });

      resolvedSource = selectedModule.location;
      resolvedUseCredentials =
        useCredentials ?? selectedModule.private ?? false;
    } catch (error) {
      console.error(
        'Error in module selection:',
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  } else {
    try {
      const projectPath = openProject(options);
      const moduleListPath = resolve(projectPath, '.temp/moduleList.json');
      let moduleListContent = '{ "modules": [] }';
      try {
        moduleListContent = await readFile(moduleListPath, 'utf-8');
      } catch {
        // if file is missing, either project that was created before hub support, or
        // creation of project done with 'skipModuleImport' flag.
        // TODO: The item should be logged once we have log that is shareable between applications.
      }
      const moduleList = JSON.parse(moduleListContent);
      const modules = moduleList.modules || [];
      const foundModule = modules?.find(
        (m: ModuleSettingFromHub) => m.name === parsedSource,
      );

      if (foundModule) {
        resolvedSource = foundModule.location;
        resolvedUseCredentials = useCredentials ?? foundModule.private ?? false;
      }
    } catch (error) {
      if (error instanceof Error) {
        // TODO: The item should be logged.
        console.error(error.message);
      }
    }
  }

  const result = await commandHandler.command(
    Cmd.import,
    [
      'module',
      resolvedSource!,
      String(resolvedUseCredentials),
      ...(version ? [version] : []),
    ],
    Object.assign({}, options, program.opts()),
    credentials(),
  );
  handleResponse(result);
}

const moduleSourceArg = new Argument(
  '[source]',
  'Path, git URL, or module name. Append "@<version>" to pin a semver version or range (e.g. "my-module@^1.0.0"). If omitted, shows interactive selection.',
);
const moduleUseCredentialsArg = new Argument(
  '[useCredentials]',
  'When using git URL uses credentials for cloning. Default: false',
);

async function moduleUpdateAction(
  moduleName: string | undefined,
  version: string | undefined,
  options: CommandOptions<'updateModules'>,
) {
  const result = await commandHandler.command(
    Cmd.updateModules,
    [moduleName!, version!],
    Object.assign({}, options, program.opts()),
    credentials(),
  );
  if (options.dryRun && result.statusCode === 200) {
    const { lines, failed } = renderUpdatePlan(result.payload as UpdatePlan);
    console.log(lines.join('\n'));
    if (failed) process.exitCode = 1;
    return;
  }
  handleResponse(result);
}

export function registerImportModule(importCmd: Command) {
  // Import module
  importCmd
    .command('module', { hidden: true })
    .description('Deprecated. Use "cyberismo module install" instead.')
    .addArgument(moduleSourceArg)
    .addArgument(moduleUseCredentialsArg)
    .action(
      async (
        source: string,
        useCredentials: boolean,
        options: CommandOptions<'import'>,
      ) => {
        deprecationNote('import module', 'module install');
        await moduleInstallAction(source, useCredentials, options);
      },
    );
}

export function registerModule(program: Command) {
  // Module command
  const moduleCmd = new CommandGroup('module').description(
    'Manage the modules of the project',
  );
  program.addCommand(moduleCmd);

  moduleCmd
    .command('install')
    .description(
      'Installs another project to this project as a module. Source can be local relative file path, git HTTPS URL, or module name from fetched module list.',
    )
    .addArgument(moduleSourceArg)
    .addArgument(moduleUseCredentialsArg)
    .action(moduleInstallAction);

  moduleCmd
    .command('update')
    .description(
      'Updates to latest versions either all modules or a specific module',
    )
    .argument('[moduleName]', 'Module name')
    .argument(
      '[version]',
      'Target version to update to (only with a specific module)',
    )
    .option(
      '--dry-run',
      'Show what the update would do without changing anything',
    )
    .action(moduleUpdateAction);

  moduleCmd
    .command('remove')
    .description('Removes an imported module from the project')
    .argument('<name>', 'Name of the module to remove')
    .action(async (name: string, options: CommandOptions<'remove'>) => {
      await removeAction('module', name, undefined, undefined, options);
    });

  moduleCmd
    .command('list')
    .description('Lists the modules imported to the project')
    .action(async (options: CommandOptions<'show'>) => {
      await showAction('modules', undefined, options);
    });
}

export function registerUpdateModules(program: Command) {
  // Updates all modules, or specific named module in the project.
  const updateModulesCmd = new CommandWithPath('update-modules')
    .description('Deprecated. Use "cyberismo module update" instead.')
    .argument('[moduleName]', 'Module name')
    .argument(
      '[version]',
      'Target version to update to (only with a specific module)',
    );
  program.addCommand(updateModulesCmd, { hidden: true });
  updateModulesCmd.action(
    async (moduleName, version, options: CommandOptions<'updateModules'>) => {
      deprecationNote('update-modules', 'module update');
      await moduleUpdateAction(moduleName, version, options);
    },
  );
}

export function registerCheckUpdates(program: Command) {
  // Deprecated spelling of `module update --dry-run`.
  const checkUpdatesCmd = new CommandWithPath('check-updates')
    .description('Deprecated. Use "cyberismo module update --dry-run" instead.')
    .argument('[moduleName]', 'Module name to check. If omitted, checks all.');
  program.addCommand(checkUpdatesCmd, { hidden: true });
  checkUpdatesCmd.action(
    async (
      moduleName: string | undefined,
      options: CommandOptions<'updateModules'>,
    ) => {
      deprecationNote('check-updates', 'module update --dry-run');
      await moduleUpdateAction(moduleName, undefined, {
        ...options,
        dryRun: true,
      });
    },
  );
}
