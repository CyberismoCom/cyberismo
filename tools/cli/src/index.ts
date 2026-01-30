#!/usr/bin/env node
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

import { constants, existsSync } from 'node:fs';
import { access, lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Argument, Command, Option } from 'commander';
import confirm from '@inquirer/confirm';
import { checkbox, select } from '@inquirer/prompts';
import dotenv from 'dotenv';
import cliProgress from 'cli-progress';

import type {
  CommandOptions,
  Credentials,
  ModuleSettingFromHub,
  requestStatus,
  UpdateOperations,
} from '@cyberismo/data-handler';
import {
  Cmd,
  Commands,
  ExportFormats,
  GitManager,
  validContexts,
} from '@cyberismo/data-handler';
import { ResourceTypeParser as Parser } from './resource-type-parser.js';
import { startServer, exportSite, previewSite } from '@cyberismo/backend';

// How many validation errors are shown when staring app, if any.
const VALIDATION_ERROR_ROW_LIMIT = 10;
const DEFAULT_HUB =
  'https://raw.githubusercontent.com/CyberismoCom/cyberismo/main/tools/assets/src/hub/';

// To avoid duplication, fetch description and version from package.json file.
// Importing dynamically allows filtering of warnings in cli/bin/run.
const packageDef = (await import('../package.json', { with: { type: 'json' } }))
  .default;

// Truncates a multi-row message to an array of items.
// Logs maximum of 'limit' items to console. If there are more items than
// 'limit', the last element is replaced with "..." to indicate truncation.
// Returns the potentially truncated array.
function truncateMessage(
  messages: string,
  limit: number = VALIDATION_ERROR_ROW_LIMIT,
): string[] {
  const array = messages.split('\n');
  if (array.length < limit) {
    return [...array];
  }
  if (limit <= 0) {
    return [];
  }
  if (limit === 1) {
    return ['...'];
  }
  return [...array.slice(0, limit - 1), '...'];
}

// Sets up credentials for git operations.
function credentials(): Credentials | undefined {
  return {
    username: process.env.CYBERISMO_GIT_USER,
    token: process.env.CYBERISMO_GIT_TOKEN,
  };
}

// Handle the response object from data-handler
function handleResponse(response: requestStatus) {
  if (response.statusCode === 200) {
    if (response.payload) {
      if (response.message) {
        console.log(response.message);
      }
      console.log(JSON.stringify(response.payload, null, 2));
    } else if (response.message) {
      console.log(response.message);
    } else {
      console.log('Done');
    }
  } else {
    if (response.message) {
      program.error(response.message);
    }
  }
}

// Helper to get modules that have not been imported.
async function importableModules(options: CommandOptions<'show'>) {
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

// Load environment variables from .env file
dotenv.config({ quiet: true });

// CLI command handler
const commandHandler = new Commands();

// Commander
const program = new Command();

// Ensure that all names have the same guideline.
const nameGuideline =
  'Name can contain letters (a-z|A-Z), spaces, underscores or hyphens.';
const pathGuideline =
  'Path to the project root. Mandatory if not running inside a project tree.';

const additionalHelpForRemove = `Sub-command help:
  remove attachment <cardKey> <filename>, where
      <cardKey> is card key of the owning card,
      <filename> is attachment filename.

  remove card <cardKey>, where
      <cardKey> Card key of card to remove

  remove label <cardKey> [label], where
      <cardKey> Card key of the label
      [label] Label being removed

  remove link <source> <destination> <linkType>, where
      <source> Source card key of the link
      <destination> Destination card key of the link
      <linkType> Link type to remove

  remove module <name>, where
      <name> Name of the module to remove

  remove hub <location>, where
      <location> URL of hub to remove. Use 'default' if removing default hub.

  remove <resourceName>, where
    <resourceName> is <project prefix>/<type>/<identifier>, where
      <project prefix> Prefix for the project.
      <type> is plural form of supported types; e.g. "workflows"
      <identifier> name of a specific resource.
    Note that you cannot remove resources from imported modules.`;

const additionalHelpForUpdate = `Sub-command help:
  update <resourceName> <operation> <key> <value> [newValue], where
      <resourceName> Resource name (e.g., myProject/cardTypes/myCard)
      <operation> Type of change: "add", "change", "rank", or "remove"
      <key> Property to change in resource
      <value> Current value (for change/remove) or value to add
      [newValue] New value when using "change" operation

  Special case - Workflow changes with state mapping:
    When changing a card type's workflow, you can provide a mapping file
    to automatically update cards' workflow states:

    cyberismo update myProject/cardTypes/myCard change workflow oldWorkflow newWorkflow --mapping-file mapping.json

    The mapping file should be JSON with this format:
    {
      "stateMapping": {
        "ExistingState1": "NewState1",
        "ExistingState2": "NewState2"
      }
    }

    If there are states that are skipped, a warning is produced.
    `;

const contextOption = new Option(
  '-c, --context [context]',
  'Context to run the logic programs in.',
)
  .choices(validContexts)
  .default('app');

const pathOption = new Option('-p, --project-path <path>', pathGuideline);

// Custom Command class with pathOption pre-configured
class CommandWithPath extends Command {
  createCommand(name?: string): CommandWithPath {
    return new CommandWithPath(name);
  }

  constructor(name?: string) {
    super(name);
    this.addOption(pathOption);
  }
}

// Main CLI program.
program
  .name('cyberismo')
  .description(packageDef.description)
  .version(
    `cyberismo version: ${packageDef.version}\nSchema version: ${commandHandler.getSchemaVersion()}`,
    '-v, --version',
    'Output the version information',
  )
  .helpOption('-h, --help', 'Display help for command')
  .addOption(
    new Option('-L, --log-level <level>', 'Set the log level')
      .choices(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
      .default('fatal'),
  );

const addCmd = new CommandWithPath('add').description(
  'Add items to the project',
);
program.addCommand(addCmd);

// Add card to a template
addCmd
  .command('card')
  .description('Add card to a template')
  .argument(
    '<template>',
    'Template for a new card. \nYou can list the templates in a project with "show templates" command.',
  )
  .argument(
    '<cardType>',
    'Card type to use for the new card. \nYou can list the card types in a project with "show cardTypes" command.',
  )
  .argument('[cardKey]', "Parent card's card key")
  .option('-r, --repeat <quantity>', 'Add multiple cards to a template')
  .action(
    async (
      template: string,
      cardType: string,
      cardKey: string,
      options: CommandOptions<'add'>,
    ) => {
      const result = await commandHandler.command(
        Cmd.add,
        ['card', template, cardType, cardKey],
        Object.assign({}, options, program.opts()),
      );
      handleResponse(result);
    },
  );

addCmd
  .command('hub')
  .description('Add a hub to the project')
  .argument(
    '<location>',
    'Hub URL. Default hub can be added by using "default"',
  )
  .action(async (location: string, options: CommandOptions<'add'>) => {
    if (location === 'default') {
      location = DEFAULT_HUB;
    }
    const result = await commandHandler.command(
      Cmd.add,
      ['hub', location],
      Object.assign({}, options, program.opts()),
    );
    handleResponse(result);
  });

const calculate = new CommandWithPath('calc').description(
  'Used for running logic programs',
);
program.addCommand(calculate);

calculate
  .command('generate')
  .description('Generate a logic program')
  .argument(
    '<destination>',
    'Path to an output file. Command writes the logic program to this file.',
  )
  .argument('[query]', 'Query to run')
  .action(
    async (
      destination: string,
      query: string,
      options: CommandOptions<'calc'>,
    ) => {
      const result = await commandHandler.command(
        Cmd.calc,
        ['generate', destination, query],
        Object.assign({}, options, program.opts()),
      );
      handleResponse(result);
    },
  );

calculate
  .command('run')
  .description('Run a logic program')
  .argument('<filePath>', 'Path to the logic program')
  .addOption(contextOption)
  .action(async (filePath: string, options: CommandOptions<'calc'>) => {
    const result = await commandHandler.command(
      Cmd.calc,
      ['run', filePath],
      Object.assign({}, options, program.opts()),
    );
    handleResponse(result);
  });

const createCmd = new CommandWithPath('create').description(
  'Create cards, resources and other project items',
);
program.addCommand(createCmd);

// Create attachment subcommand
createCmd
  .command('attachment')
  .description('Create an attachment for a card')
  .argument('<cardKey>', 'Card key of the card to attach to')
  .argument('<filename>', 'Path to the file to attach')
  .action(
    async (
      cardKey: string,
      filename: string,
      options: CommandOptions<'create'>,
    ) => {
      const result = await commandHandler.command(
        Cmd.create,
        ['attachment', cardKey, filename],
        Object.assign({}, options, program.opts()),
      );
      handleResponse(result);
    },
  );

// Create card subcommand
createCmd
  .command('card')
  .description('Create a card from a template')
  .argument(
    '<template>',
    'Template to use. You can list templates with "show templates" command',
  )
  .argument(
    '[parentCardKey]',
    "Parent card's card key. If defined, new card will be created as a child",
  )
  .action(
    async (
      template: string,
      parentCardKey: string | undefined,
      options: CommandOptions<'create'>,
    ) => {
      const result = await commandHandler.command(
        Cmd.create,
        ['card', template, parentCardKey].filter(Boolean) as string[],
        Object.assign({}, options, program.opts()),
      );
      handleResponse(result);
    },
  );

// Create cardType subcommand
createCmd
  .command('cardType')
  .description('Create a new card type')
  .argument('<name>', `Name for card type. ${nameGuideline}`)
  .argument(
    '<workflow>',
    'Workflow for the card type. You can list workflows with "show workflows" command',
  )
  .action(
    async (
      name: string,
      workflow: string,
      options: CommandOptions<'create'>,
    ) => {
      const result = await commandHandler.command(
        Cmd.create,
        ['cardType', name, workflow],
        Object.assign({}, options, program.opts()),
      );
      handleResponse(result);
    },
  );

// Create fieldType subcommand
createCmd
  .command('fieldType')
  .description('Create a new field type')
  .argument('<name>', `Name for field type. ${nameGuideline}`)
  .argument(
    '<dataType>',
    'Type of field. You can list field types with "show fieldTypes" command',
  )
  .action(
    async (
      name: string,
      dataType: string,
      options: CommandOptions<'create'>,
    ) => {
      const result = await commandHandler.command(
        Cmd.create,
        ['fieldType', name, dataType],
        Object.assign({}, options, program.opts()),
      );
      handleResponse(result);
    },
  );

// Create graphModel subcommand
createCmd
  .command('graphModel')
  .description('Create a new graph model')
  .argument('<name>', `Name for graph model. ${nameGuideline}`)
  .action(async (name: string, options: CommandOptions<'create'>) => {
    const result = await commandHandler.command(
      Cmd.create,
      ['graphModel', name],
      Object.assign({}, options, program.opts()),
    );
    handleResponse(result);
  });

// Create graphView subcommand
createCmd
  .command('graphView')
  .description('Create a new graph view')
  .argument('<name>', `Name for graph view. ${nameGuideline}`)
  .action(async (name: string, options: CommandOptions<'create'>) => {
    const result = await commandHandler.command(
      Cmd.create,
      ['graphView', name],
      Object.assign({}, options, program.opts()),
    );
    handleResponse(result);
  });

// Create calculation subcommand
createCmd
  .command('calculation')
  .description('Create a new calculation')
  .argument('<name>', `Name for calculation. ${nameGuideline}`)
  .action(async (name: string, options: CommandOptions<'create'>) => {
    const result = await commandHandler.command(
      Cmd.create,
      ['calculation', name],
      Object.assign({}, options, program.opts()),
    );
    handleResponse(result);
  });

// Create label subcommand
createCmd
  .command('label')
  .description('Create a label on a card')
  .argument('<cardKey>', 'Card key')
  .argument('<labelName>', 'Name for the new label')
  .action(
    async (
      cardKey: string,
      labelName: string,
      options: CommandOptions<'create'>,
    ) => {
      const result = await commandHandler.command(
        Cmd.create,
        ['label', cardKey, labelName],
        Object.assign({}, options, program.opts()),
      );
      handleResponse(result);
    },
  );

// Create link subcommand
createCmd
  .command('link')
  .description('Create a link between two cards')
  .argument('<source>', 'Source card key')
  .argument('<destination>', 'Destination card key')
  .argument('<linkType>', 'Link type to create')
  .argument('[description]', 'Optional link description')
  .action(
    async (
      source: string,
      destination: string,
      linkType: string,
      description: string | undefined,
      options: CommandOptions<'create'>,
    ) => {
      const result = await commandHandler.command(
        Cmd.create,
        ['link', source, destination, linkType, description].filter(
          Boolean,
        ) as string[],
        Object.assign({}, options, program.opts()),
      );
      handleResponse(result);
    },
  );

// Create linkType subcommand
createCmd
  .command('linkType')
  .description('Create a new link type')
  .argument('<name>', `Name for link type. ${nameGuideline}`)
  .action(async (name: string, options: CommandOptions<'create'>) => {
    const result = await commandHandler.command(
      Cmd.create,
      ['linkType', name],
      Object.assign({}, options, program.opts()),
    );
    handleResponse(result);
  });

// Create project subcommand
createCmd
  .command('project')
  .description('Create a new project')
  .argument('<name>', 'Project name')
  .argument('<prefix>', 'Project prefix')
  .argument('<path>', 'Path where to create the project')
  .argument('[category]', 'Project category (optional)')
  .argument('[description]', 'Project description (optional)')
  .option(
    '-s, --skipModuleImport',
    'Skip importing modules when creating a project',
  )
  .action(
    async (
      name: string,
      prefix: string,
      path: string,
      category: string | undefined,
      description: string | undefined,
      options: CommandOptions<'create'>,
    ) => {
      // Project path must be set to 'options' when creating a project
      options.projectPath = path;
      const commandOptions = Object.assign({}, options, program.opts());

      const result = await commandHandler.command(
        Cmd.create,
        ['project', name, prefix, path, category || '', description || ''],
        commandOptions,
      );

      // Post-handling after creating a new project
      if (!commandOptions.skipModuleImport && result.statusCode === 200) {
        try {
          // add default hub
          const addHubResult = await commandHandler.command(
            Cmd.add,
            ['hub', DEFAULT_HUB],
            commandOptions,
          );
          if (addHubResult.statusCode !== 200) {
            program.error(
              `Project creation failed: could not add default hub - ${addHubResult.message || 'Unknown error'}`,
            );
          }

          // fetch modules from default hub
          const fetchResult = await commandHandler.command(
            Cmd.fetch,
            ['hubs'],
            commandOptions,
          );
          if (fetchResult.statusCode !== 200) {
            program.error(
              `Project creation failed: could not fetch hub data - ${fetchResult.message || 'Unknown error'}`,
            );
          }

          // show importable modules
          const choices = await importableModules(commandOptions);
          const selectedModules = await checkbox({
            message: 'Select modules to import',
            theme: { helpMode: 'always' },
            choices,
          });

          // finally, import the selected modules
          const failedModules: string[] = [];
          for (const module of selectedModules) {
            const importResult = await commandHandler.command(
              Cmd.import,
              [
                'module',
                module.location,
                module.branch ?? '',
                module.private ? 'true' : 'false',
              ],
              { ...commandOptions, skipMigrationLog: true },
            );
            if (importResult.statusCode !== 200) {
              console.warn(
                `Failed to import module '${module.name}':`,
                importResult.message || 'Unknown error',
              );
              failedModules.push(module.name);
            }
          }

          if (failedModules.length > 0) {
            console.warn(
              `\nSome modules failed to import: ${failedModules.join(', ')}`,
            );
          }

          // Commit the imported modules to Git
          if (selectedModules.length > 0) {
            try {
              const gitManager = new GitManager(path);
              await gitManager.addAll();
              const moduleNames = selectedModules
                .filter((m) => !failedModules.includes(m.name))
                .map((m) => m.name)
                .join(', ');
              if (moduleNames) {
                await gitManager.commit(`Import modules: ${moduleNames}`);
              }
            } catch (gitError) {
              console.warn(
                'Failed to commit imported modules:',
                gitError instanceof Error ? gitError.message : gitError,
              );
            }
          }
        } catch (error) {
          if (error instanceof Error) {
            console.warn('Module import setup failed:', error.message);
          }
          console.log(
            'Project created successfully, but module import was skipped',
          );
        }
      }

      handleResponse(result);
    },
  );

// Create report subcommand
createCmd
  .command('report')
  .description('Create a new report')
  .argument('<name>', `Name for report. ${nameGuideline}`)
  .action(async (name: string, options: CommandOptions<'create'>) => {
    const result = await commandHandler.command(
      Cmd.create,
      ['report', name],
      Object.assign({}, options, program.opts()),
    );
    handleResponse(result);
  });

// Create template subcommand
createCmd
  .command('template')
  .description('Create a new template')
  .argument('<name>', `Name for template. ${nameGuideline}`)
  .argument(
    '[content]',
    'Template content. If empty, template is created with default values. Must conform to templateSchema.json',
  )
  .action(
    async (
      name: string,
      content: string | undefined,
      options: CommandOptions<'create'>,
    ) => {
      const result = await commandHandler.command(
        Cmd.create,
        ['template', name, content].filter(Boolean) as string[],
        Object.assign({}, options, program.opts()),
      );
      handleResponse(result);
    },
  );

// Create workflow subcommand
createCmd
  .command('workflow')
  .description('Create a new workflow')
  .argument('<name>', `Name for workflow. ${nameGuideline}`)
  .argument(
    '[content]',
    'Workflow content. If empty, workflow is created with default values. Must conform to workflowSchema.json',
  )
  .action(
    async (
      name: string,
      content: string | undefined,
      options: CommandOptions<'create'>,
    ) => {
      const result = await commandHandler.command(
        Cmd.create,
        ['workflow', name, content].filter(Boolean) as string[],
        Object.assign({}, options, program.opts()),
      );
      handleResponse(result);
    },
  );

// Create new resource subcommand
createCmd
  .command('resource')
  .description('Create a new resource')
  .argument(
    '<resourceName>',
    'Resource name (e.g. <prefix>/<type>/<identifier>)',
  )
  .argument(
    '[content]',
    'Resource content. If empty, resource is created with default values. Must conform to its resource schema',
  )
  .action(
    async (
      resourceName: string,
      content: string | undefined,
      options: CommandOptions<'create'>,
    ) => {
      const result = await commandHandler.command(
        Cmd.create,
        [resourceName, content].filter(Boolean) as string[],
        Object.assign({}, options, program.opts()),
      );
      handleResponse(result);
    },
  );

// Edit command
const editCmd = new CommandWithPath('edit')
  .description('Edit a card')
  .argument('<cardKey>', 'Card key of card');
program.addCommand(editCmd);
editCmd.action(async (cardKey: string, options: CommandOptions<'edit'>) => {
  const result = await commandHandler.command(
    Cmd.edit,
    [cardKey],
    Object.assign({}, options, program.opts()),
  );
  handleResponse(result);
});

// Export command
const exportCmd = new CommandWithPath('export').description(
  'Export a project or a card',
);
program.addCommand(exportCmd);
exportCmd
  .addArgument(
    new Argument('<format>', 'Export format').choices(
      Object.values(ExportFormats),
    ),
  )
  .argument('<output>', 'Output path')
  .argument(
    '[cardKey]',
    'Export a specific card by card key. If omitted, exports the whole site.',
  )
  .option(
    '-r, --recursive',
    'Export cards under the specified card recursively',
  )
  .option(
    '-t, --title [title]',
    'Title of the exported document(pdf export only)',
  )
  .option('-n, --name [name]', 'Name of the exported document(pdf export only)')
  .option('-d, --date [date]', 'Date of the exported document(pdf export only)')
  .option(
    '--doc-version [version]',
    'Version of the exported document(pdf export only)',
  )
  .option(
    '-m, --revremark [revremark]',
    'Revision remark of the exported document(pdf export only)',
  )
  .action(
    async (
      format: string,
      output: ExportFormats,
      cardKey: string,
      options: CommandOptions<'export'>,
    ) => {
      if (format === 'site') {
        const progress = new cliProgress.SingleBar(
          {},
          cliProgress.Presets.shades_classic,
        );
        // Should be in commandHandler, once it is moved under the CLI package
        try {
          const { errors } = await exportSite(
            await commandHandler.getProjectPath(options.projectPath),
            output,
            {
              recursive: options.recursive,
              cardKey: cardKey,
            },
            options.logLevel,
            (current?: number, total?: number) => {
              if (!progress.isActive && total !== undefined) {
                progress.start(total, 0);
              }
              if (total !== undefined && progress.getTotal() !== total) {
                progress.setTotal(total);
              }
              if (current !== undefined) {
                progress.update(current);
              }
            },
          );
          progress.stop();
          if (errors.length > 0) {
            console.log(
              'Export completed with errors:\n' +
                truncateMessage(errors.join('\n')).join('\n'),
            );
            return;
          }
          console.log('Exported site to', output);
          console.log('Run `cyberismo preview out` to view the site');
          return;
        } catch (e) {
          handleResponse({
            statusCode: 500,
            message: e instanceof Error ? e.message : String(e),
          });
        } finally {
          progress.stop();
        }
      }
      const result = await commandHandler.command(
        Cmd.export,
        [format, output, cardKey],
        Object.assign({}, options, program.opts()),
      );
      handleResponse(result);
    },
  );

const fetchCmd = new CommandWithPath('fetch').description(
  'Retrieve external data to local file system.',
);
program.addCommand(fetchCmd);

fetchCmd
  .command('hubs')
  .description('Retrieves module lists from hubs')
  .action(async (options: CommandOptions<'fetch'>) => {
    const result = await commandHandler.command(
      Cmd.fetch,
      ['hubs'],
      Object.assign({}, options, program.opts()),
    );
    handleResponse(result);
  });

const importCmd = new CommandWithPath('import').description(
  'Import modules and data into the project',
);
program.addCommand(importCmd);

// Import module
importCmd
  .command('module')
  .description(
    'Imports another project to this project as a module. Source can be local relative file path, git HTTPS URL, or module name from fetched module list.',
  )
  .argument(
    '[source]',
    'Path to import from or module name. If omitted, shows interactive selection',
  )
  .argument('[branch]', 'When using git URL defines the branch. Default: main')
  .argument(
    '[useCredentials]',
    'When using git URL uses credentials for cloning. Default: false',
  )
  .action(
    async (
      source: string,
      branch: string,
      useCredentials: boolean,
      options: CommandOptions<'import'>,
    ) => {
      let resolvedSource = source;
      let resolvedBranch = branch;
      let resolvedUseCredentials = useCredentials;

      if (!source) {
        // Interactive mode: show importable modules
        try {
          const choices = await importableModules(options);
          const selectedModule = await select({
            message: 'Select a module to import:',
            choices,
          });

          resolvedSource = selectedModule.location;
          resolvedBranch = branch || selectedModule.branch || '';
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
          const projectPath = await commandHandler.getProjectPath(
            options.projectPath,
          );
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
            (m: ModuleSettingFromHub) => m.name === source,
          );

          if (foundModule) {
            resolvedSource = foundModule.location;
            resolvedBranch = branch || foundModule.branch || '';
            resolvedUseCredentials =
              useCredentials ?? foundModule.private ?? false;
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
          resolvedBranch,
          String(resolvedUseCredentials),
        ],
        Object.assign({}, options, program.opts()),
        credentials(),
      );
      handleResponse(result);
    },
  );

// import csv
importCmd
  .command('csv')
  .description('Imports cards from a csv file')
  .argument('<csvFile>', 'File to import from')
  .argument(
    '[cardKey]',
    'Parent card key. If defined, cards are created as children of this card',
  )
  .action(
    async (
      csvFile: string,
      cardKey: string,
      options: CommandOptions<'import'>,
    ) => {
      const result = await commandHandler.command(
        Cmd.import,
        ['csv', csvFile, cardKey],
        Object.assign({}, options, program.opts()),
      );
      handleResponse(result);
    },
  );

// Migrate command
program
  .command('migrate')
  .description('Migrate project schema to a newer version.')
  .argument(
    '[version]',
    'Target schema version. If not provided, migrates to the latest version. Can only migrate one version at a time when specified.',
  )
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .option(
    '-b, --backup <directory>',
    'Create a backup before migration in the specified directory. Directory must exist.',
  )
  .option(
    '-t, --timeout <minutes>',
    'Timeout for migration in minutes (default: 2 minutes)',
    '2',
  )
  .action(async (version: string, options: CommandOptions<'migrate'>) => {
    if (version) {
      const versionNumber = parseInt(version);
      if (isNaN(versionNumber)) {
        console.error(`Error: migration version is not a number: '${version}'`);
        process.exit(1);
      }
      if (versionNumber <= 0) {
        console.error(
          `Error: migration version must be above zero: '${version}'`,
        );
        process.exit(1);
      }
      if (options.backup) {
        options.backup = resolve(options.backup.toString().trim());
        if (!existsSync(options.backup)) {
          console.error(
            `Error: Backup directory does not exist: ${options.backup}`,
          );
          process.exit(1);
        }
        try {
          await access(options.backup, constants.W_OK);
        } catch {
          console.error(
            `Error: Cannot write to backup directory: ${options.backup}`,
          );
          process.exit(1);
        }
        if (!(await lstat(options.backup)).isDirectory()) {
          console.error(`Error: Backup directory is a file: ${options.backup}`);
          process.exit(1);
        }
      }
    }

    if (options.timeout !== undefined) {
      const timeoutMinutes = Number(options.timeout);
      if (isNaN(timeoutMinutes) || timeoutMinutes <= 0) {
        console.error(`Error: Timeout must be a positive number`);
        process.exit(1);
      }
      // Convert minutes to milliseconds
      options.timeout = timeoutMinutes * 60 * 1000;
    }

    const result = await commandHandler.command(
      Cmd.migrate,
      [version],
      Object.assign({}, options, program.opts()),
    );
    handleResponse(result);
  });

// Move command
const moveCmd = new CommandWithPath('move')
  .description(
    'Moves a card from root to under another card, from under another card to root, or from under a one card to another.',
  )
  .argument('[source]', 'Source Card key that needs to be moved')
  .argument(
    '[destination]',
    'Destination Card key where "source" is moved to. If moving to root, use "root"',
  );
program.addCommand(moveCmd);
moveCmd.action(
  async (
    source: string,
    destination: string,
    options: CommandOptions<'move'>,
  ) => {
    const result = await commandHandler.command(
      Cmd.move,
      [source, destination],
      Object.assign({}, options, program.opts()),
    );
    handleResponse(result);
  },
);

program
  .command('preview')
  .description('Preview the exported site')
  .argument(
    '[dir]',
    'Directory to preview. If not provided, current directory is used.',
  )
  .action(async (dir: string) => {
    await previewSite(dir || '.', true);
  });

const rank = new CommandWithPath('rank').description(
  'Manage card ranking and ordering',
);
program.addCommand(rank);

rank
  .command('card')
  .description(
    'Set the rank of a card. Ranks define the order in which cards are shown.',
  )
  .argument('<cardKey>', 'Card key of the card to be moved')
  .argument(
    '<afterCardKey>',
    'Card key of the card that the card should be after. Use "first" to rank the card first.',
  )
  .action(
    async (
      cardKey: string,
      afterCardKey: string,
      options: CommandOptions<'rank'>,
    ) => {
      const result = await commandHandler.command(
        Cmd.rank,
        ['card', cardKey, afterCardKey],
        Object.assign({}, options, program.opts()),
      );
      handleResponse(result);
    },
  );

rank
  .command('rebalance')
  .description(
    'Rebalance the rank of all cards in the project. Can be also used, if ranks do not exist',
  )
  .argument(
    '[parentCardKey]',
    'if null, rebalance the whole project, otherwise rebalance only the direct children',
  )
  .action(async (cardKey: string, options: CommandOptions<'rank'>) => {
    const result = await commandHandler.command(
      Cmd.rank,
      ['rebalance', cardKey],
      Object.assign({}, options, program.opts()),
    );
    handleResponse(result);
  });

// Remove command
const removeCmd = new CommandWithPath('remove').description(
  'Remove cards, resources and other project items',
);
program.addCommand(removeCmd);
removeCmd
  .argument(
    '<type>',
    `removable types: '${Parser.listTargets('remove').join("', '")}', or resource name (e.g. <prefix>/<type>/<identifier>)`,
    Parser.parseRemoveTypes,
  )
  .argument(
    '[parameter1]',
    'Depends on context; see below for specific remove operation',
  )
  .argument(
    '[parameter2]',
    'Depends on context; see below for specific remove operation',
  )
  .argument(
    '[parameter3]',
    'Depends on context; see below for specific remove operation',
  )
  .addHelpText('after', additionalHelpForRemove)
  .action(
    async (
      type: string,
      parameter1: string,
      parameter2: string,
      parameter3: string,
      options: CommandOptions<'remove'>,
    ) => {
      if (type) {
        if (!parameter1) {
          if (type === 'attachment' || type === 'card' || type === 'label') {
            program.error('error: missing argument <cardKey>');
          } else if (type === 'link') {
            program.error('error: missing argument <source>');
          } else if (type === 'module') {
            program.error('error: missing argument <moduleName>');
          } else {
            if (Parser.listTargets('remove').includes(type)) {
              program.error('error: missing argument <resourceName>');
            }
          }
        }
        if (!parameter2 && type === 'attachment') {
          program.error('error: missing argument <filename>');
        }
        if (!parameter2 && type === 'link') {
          program.error('error: missing argument <destination>');
        }
        if (!parameter3 && type === 'link') {
          program.error('error: missing argument <linkType>');
        }

        if (!parameter1 && type === 'hub') {
          program.error('error: missing argument <location>');
        }
        if (type === 'hub' && parameter1 === 'default') {
          parameter1 = DEFAULT_HUB;
        }

        const result = await commandHandler.command(
          Cmd.remove,
          [type, parameter1, parameter2, parameter3],
          Object.assign({}, options, program.opts()),
        );
        handleResponse(result);
      }
    },
  );

// Rename command
const renameCmd = new CommandWithPath('rename')
  .description(
    'Change project prefix and rename all the content with the new prefix',
  )
  .argument('<to>', 'New project prefix');
program.addCommand(renameCmd);
renameCmd.action(async (to: string, options: CommandOptions<'rename'>) => {
  const result = await commandHandler.command(
    Cmd.rename,
    [to],
    Object.assign({}, options, program.opts()),
  );
  handleResponse(result);
});

// Report command
const reportCmd = new CommandWithPath('report')
  .description('Runs a report')
  .argument(
    '<parameters>',
    'Path to parameters file. This file defines which report to run and what parameters to use.',
  )
  .argument(
    '[output]',
    'Optional output file; if omitted output will be directed to stdout',
  )
  .addOption(contextOption);
program.addCommand(reportCmd);
reportCmd.action(
  async (
    parameters: string,
    output: string,
    options: CommandOptions<'report'>,
  ) => {
    const result = await commandHandler.command(
      Cmd.report,
      [parameters, output],
      Object.assign({}, options, program.opts()),
    );
    handleResponse(result);
  },
);

// Show command
const showCmd = new CommandWithPath('show').description(
  'Shows details from a project',
);
program.addCommand(showCmd);
showCmd
  .argument(
    '<type>',
    `details can be seen from: ${Parser.listTargets('show').join(', ')}`,
    Parser.parseShowTypes,
  )
  .argument(
    '[typeDetail]',
    'additional information about the requested type; for example a card key',
  )
  .option(
    '-d --details',
    'Certain types (such as cards) can have additional details',
  )
  .option(
    '-a --showAll',
    'Show all modules, irregardless if it has been imported or not. Only with "show importableModules"',
  )
  .option(
    '-u --show-use',
    'Show where resource is used. Only used with resources, otherwise will be ignored.',
  )
  .action(async (type: string, typeDetail, options: CommandOptions<'show'>) => {
    if (type !== '') {
      const result = await commandHandler.command(
        Cmd.show,
        [type, typeDetail],
        Object.assign({}, options, program.opts()),
      );
      // By default, do not show resources' content files
      if (!options.details) {
        if (
          typeof result.payload === 'object' &&
          result.payload !== null &&
          'content' in result.payload
        ) {
          delete (result.payload as { content?: unknown }).content;
        }
      }
      handleResponse(result);
    }
  });

// Transition command
const transitionCmd = new CommandWithPath('transition')
  .description('Transition a card to the specified state')
  .argument('<cardKey>', 'card key of a card')
  .argument(
    '<transition>',
    'Workflow state transition that is done.\nYou can list the workflows in a project with "show workflows" command.\nYou can see the available transitions with "show workflow <name>" command.',
  );
program.addCommand(transitionCmd);
transitionCmd.action(
  async (
    cardKey: string,
    transition: string,
    options: CommandOptions<'transition'>,
  ) => {
    const result = await commandHandler.command(
      Cmd.transition,
      [cardKey, transition],
      Object.assign({}, options, program.opts()),
    );
    handleResponse(result);
  },
);

// Update command
const updateCmd = new CommandWithPath('update').description(
  'Update resource details',
);
program.addCommand(updateCmd);
updateCmd
  .argument('<resourceName>', 'Resource name')
  .argument(
    '<operation>',
    'Type of change, either "add", "change", "rank" or "remove" ',
  )
  .argument('<key>', 'Detail to be changed')
  .argument('<value>', 'Value for a detail')
  .argument(
    '[newValue]',
    'When using "change" define new value for detail.\nWhen using "remove" provide optional replacement value for removed value',
  )
  .option(
    '-m, --mapping-file <path>',
    'Path to JSON file containing workflow state mapping (only used when changing workflow)',
  )
  .addHelpText('after', additionalHelpForUpdate)
  .action(
    async (
      resourceName: string,
      operation: UpdateOperations,
      key: string,
      value: string,
      newValue: string,
      options: CommandOptions<'update'>,
    ) => {
      const result = await commandHandler.command(
        Cmd.update,
        [resourceName, operation, key, value, newValue],
        Object.assign({}, options, program.opts()),
      );
      handleResponse(result);
    },
  );

// Updates all modules, or specific named module in the project.
const updateModulesCmd = new CommandWithPath('update-modules')
  .description(
    'Updates to latest versions either all modules or a specific module',
  )
  .argument('[moduleName]', 'Module name');
program.addCommand(updateModulesCmd);
updateModulesCmd.action(
  async (moduleName, options: CommandOptions<'updateModules'>) => {
    const result = await commandHandler.command(
      Cmd.updateModules,
      [moduleName],
      Object.assign({}, options, program.opts()),
      credentials(),
    );
    handleResponse(result);
  },
);

// Session command - manage edit sessions for multi-user collaboration
const sessionCmd = new CommandWithPath('session').description(
  'Manage edit sessions for cards. Sessions provide isolated editing environments using Git worktrees.',
);
program.addCommand(sessionCmd);

sessionCmd
  .command('start')
  .description('Start a new edit session for a card')
  .argument('<cardKey>', 'Card key of the card to edit')
  .action(async (cardKey: string, options: CommandOptions<'session'>) => {
    const result = await commandHandler.command(
      Cmd.session,
      ['start', cardKey],
      Object.assign({}, options, program.opts()),
    );
    handleResponse(result);
  });

sessionCmd
  .command('save')
  .description('Save (commit) changes in an edit session')
  .argument('<sessionId>', 'Session ID to save')
  .action(async (sessionId: string, options: CommandOptions<'session'>) => {
    const result = await commandHandler.command(
      Cmd.session,
      ['save', sessionId],
      Object.assign({}, options, program.opts()),
    );
    handleResponse(result);
  });

sessionCmd
  .command('publish')
  .description(
    'Publish (merge) an edit session to the main branch. Uses "theirs" strategy for conflicts (last write wins).',
  )
  .argument('<sessionId>', 'Session ID to publish')
  .action(async (sessionId: string, options: CommandOptions<'session'>) => {
    const result = await commandHandler.command(
      Cmd.session,
      ['publish', sessionId],
      Object.assign({}, options, program.opts()),
    );
    handleResponse(result);
  });

sessionCmd
  .command('discard')
  .description('Discard an edit session, removing all uncommitted changes')
  .argument('<sessionId>', 'Session ID to discard')
  .action(async (sessionId: string, options: CommandOptions<'session'>) => {
    const result = await commandHandler.command(
      Cmd.session,
      ['discard', sessionId],
      Object.assign({}, options, program.opts()),
    );
    handleResponse(result);
  });

sessionCmd
  .command('list')
  .description('List all active edit sessions')
  .action(async (options: CommandOptions<'session'>) => {
    const result = await commandHandler.command(
      Cmd.session,
      ['list'],
      Object.assign({}, options, program.opts()),
    );
    handleResponse(result);
  });

sessionCmd
  .command('show')
  .description('Show details of an edit session')
  .argument('<sessionId>', 'Session ID to show')
  .action(async (sessionId: string, options: CommandOptions<'session'>) => {
    const result = await commandHandler.command(
      Cmd.session,
      ['show', sessionId],
      Object.assign({}, options, program.opts()),
    );
    handleResponse(result);
  });

// Validate command
const validateCmd = new CommandWithPath('validate').description(
  'Validate project structure',
);
program.addCommand(validateCmd);
validateCmd.action(async (options: CommandOptions<'validate'>) => {
  const result = await commandHandler.command(
    Cmd.validate,
    [],
    Object.assign({}, options, program.opts()),
  );
  handleResponse(result);
});

// Start app command.
// If there are validation errors, user is prompted to continue or not.
// There is 10 sec timeout on the prompt. If user does not reply, then
// it is assumed that validation errors do not matter and application
// start is resumed.
const appCmd = new CommandWithPath('app')
  .description(
    'Starts the cyberismo app, accessible with a web browser at http://localhost:3000',
  )
  .option(
    '-w, --watch-resource-changes',
    'Project watches changes in .cards folder resources',
  );
program.addCommand(appCmd);
appCmd.action(async (options: CommandOptions<'start'>) => {
  // validate project
  const result = await commandHandler.command(
    Cmd.validate,
    [],
    Object.assign({}, options, program.opts()),
  );
  if (!result.message) {
    program.error('Expected validation result, but got none');
    return;
  }
  if (result.message !== 'Project structure validated') {
    truncateMessage(result.message).forEach((item) => console.error(item));
    console.error('\n'); // The output looks nicer with one extra row.
    result.message = '';
    const userConfirmation = await confirm(
      {
        message: 'There are validation errors. Do you want to continue?',
      },
      { signal: AbortSignal.timeout(10000), clearPromptOnDone: true },
    ).catch((error) => {
      return error.name === 'AbortPromptError';
    });
    if (!userConfirmation) {
      handleResponse(result);
      return;
    }
  }
  await startServer(await commandHandler.getProjectPath(options.projectPath));
});

export default program;
