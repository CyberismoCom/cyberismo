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

import { Argument, type Command } from 'commander';

import {
  ModuleRequestError,
  type Workspace,
  ModuleReplayFailedError,
  ModuleValidationFailedError,
} from '@cyberismo/data-handler';
import type {
  Credentials,
  ModuleInstallResult,
  ModuleUpdateResult,
  ReplayedModule,
  UpdateTarget,
} from '@cyberismo/model';

import {
  CommandGroup,
  CommandWithPath,
  parseSourceAtVersion,
} from '../lib/args.js';
import { credentials, program } from '../lib/program.js';
import { onProject } from '../lib/errors.js';
import { openWorkspace } from '../lib/open.js';
import {
  cleanNote,
  deprecationNote,
  printResultWithNote,
} from '../lib/output.js';
import { select } from '../lib/prompts.js';
import { renderUpdatePlan } from '../update-plan-lines.js';
import { removeAction } from './remove.js';
import { showAction } from './show.js';
import type {
  ImportCommandOptions,
  RemoveCommandOptions,
  ShowCommandOptions,
  UpdateModulesCommandOptions,
} from '../options.js';

// Helper to get modules that have not been imported.
export async function importableModules(options: ShowCommandOptions) {
  const copyOptions = Object.assign({}, options);
  copyOptions.details = true;
  // A failed read counts as no modules.
  const importableModules = await openWorkspace(copyOptions).then(
    async (ws) => {
      await ws.modules.ensureModuleListUpToDate();
      return ws.modules.importable(copyOptions.showAll, copyOptions.details);
    },
    () => undefined,
  );

  if (!importableModules || importableModules.length === 0) {
    program.error('No modules available');
  }

  // return potential importable modules
  const choices =
    importableModules?.map((module) => ({
      name: module.displayName ? module.displayName : module.name,
      value: module,
    })) || [];
  return choices;
}

// Prints what a module install or update did besides installing the modules.
function printModuleResult(result: ModuleUpdateResult | ModuleInstallResult) {
  for (const step of result.skippedReplays) {
    console.warn(
      `Skipping migration replay for module '${step.modulePrefix}' ` +
        `(${step.fromVersion} -> ${step.toVersion}): the module failed to apply.`,
    );
  }
  for (const step of result.replayed) {
    console.log(
      `Replayed migrations for module '${step.modulePrefix}': ` +
        `${step.fromVersion} -> ${step.toVersion} (${step.seals} seal(s))` +
        describeSkipped(step),
    );
  }
  if ('newValidationErrors' in result && result.newValidationErrors) {
    console.error(
      `There are new validations errors after importing the module. Check the project`,
    );
  }
}

// Retired entries are expected and no build will apply them; unknown ones
// were most likely written by a newer build, so upgrading may apply them.
// Foreign ones target resources the module does not own and never apply.
function describeSkipped({
  retired,
  unknown,
  foreign,
}: ReplayedModule): string {
  const count = (n: number) => `${n} ${n === 1 ? 'entry' : 'entries'}`;
  const ops = (list: string[]) => [...new Set(list)].join(', ');
  let text = '';
  if (retired.length > 0) {
    text +=
      `; ignored ${count(retired.length)} for retired operations ` +
      `(${ops(retired)})`;
  }
  if (unknown.length > 0) {
    text +=
      `; skipped ${count(unknown.length)} this version does not recognise ` +
      `(${ops(unknown)}) — upgrade cyberismo to apply ` +
      `${unknown.length === 1 ? 'it' : 'them'}`;
  }
  if (foreign.length > 0) {
    text +=
      `; skipped ${count(foreign.length)} targeting resources outside ` +
      `the module (${ops(foreign)})`;
  }
  return text;
}

// Runs an install or update and prints what ran, also before a failure.
async function printingResult(
  run: () => Promise<ModuleUpdateResult | ModuleInstallResult>,
) {
  try {
    printModuleResult(await run());
  } catch (error) {
    if (
      (error instanceof ModuleReplayFailedError ||
        error instanceof ModuleValidationFailedError) &&
      error.result
    ) {
      printModuleResult(error.result);
    }
    throw error;
  }
}

// Installs a module, printing what ran; gives the clean note.
export async function installModule(
  ws: Workspace,
  source: string,
  options: { private?: boolean; credentials?: Credentials; version?: string },
): Promise<string | undefined> {
  await printingResult(() => ws.modules.install(source, options));
  return cleanNote(ws);
}

export async function moduleInstallAction(
  source: string,
  useCredentials: boolean,
  options: ImportCommandOptions,
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
  }

  // Unset (or empty) lets a hub module's own private flag apply.
  const flag =
    resolvedUseCredentials === undefined ? '' : String(resolvedUseCredentials);
  const note = await onProject(
    Object.assign({}, options, program.opts()),
    (ws) =>
      installModule(ws, resolvedSource!, {
        private: flag ? flag === 'true' : undefined,
        credentials: credentials(),
        version,
      }),
  );
  printResultWithNote(note);
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
  options: UpdateModulesCommandOptions,
) {
  const commandOptions = Object.assign({}, options, program.opts());
  const target = (): UpdateTarget => {
    if (!moduleName && version) {
      throw new ModuleRequestError(
        'A target version can only be specified together with a module name',
      );
    }
    return moduleName
      ? { module: moduleName, version: version || undefined }
      : {};
  };
  if (options.dryRun) {
    const plan = await onProject(commandOptions, (ws) =>
      ws.modules.planUpdate(target(), credentials()),
    );
    const { lines, failed } = renderUpdatePlan(plan);
    console.log(lines.join('\n'));
    if (failed) process.exitCode = 1;
    return;
  }
  const note = await onProject(commandOptions, async (ws) => {
    await printingResult(() => ws.modules.update(target(), credentials()));
    return cleanNote(ws);
  });
  printResultWithNote(note);
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
        options: ImportCommandOptions,
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
    .action(async (name: string, options: RemoveCommandOptions) => {
      await removeAction('module', name, undefined, undefined, options);
    });

  moduleCmd
    .command('list')
    .description('Lists the modules imported to the project')
    .action(async (options: ShowCommandOptions) => {
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
    async (moduleName, version, options: UpdateModulesCommandOptions) => {
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
      options: UpdateModulesCommandOptions,
    ) => {
      deprecationNote('check-updates', 'module update --dry-run');
      await moduleUpdateAction(moduleName, undefined, {
        ...options,
        dryRun: true,
      });
    },
  );
}
