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

import { Argument, Command, Option } from 'commander';
import confirm from '@inquirer/confirm';
import dotenv from 'dotenv';
import {
  type CardsOptions,
  Cmd,
  Commands,
  ExportFormats,
  type Credentials,
  type requestStatus,
  type UpdateOperations,
  validContexts,
} from '@cyberismo/data-handler';
import { ResourceTypeParser as Parser } from './resource-type-parser.js';
import { startServer, exportSite, previewSite } from '@cyberismo/backend';
import cliProgress from 'cli-progress';

// How many validation errors are shown when staring app, if any.
const VALIDATION_ERROR_ROW_LIMIT = 10;

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

// Load environment variables from .env file
dotenv.config({ quiet: true });

// Commander
const program = new Command();

// CLI command handler
const commandHandler = new Commands();

// Ensure that all names have the same guideline.
const nameGuideline =
  'Name can contain letters (a-z|A-Z), spaces, underscores or hyphens.';
const pathGuideline =
  'Path to the project root. Mandatory if not running inside a project tree.';

const additionalHelpForCreate = `Sub-command help:
  create attachment <cardKey> <filename>, where
      <cardKey> is card key of a card to have the attachment,
      <filename> is attachment filename.

  create card <template> [cardKey], where
      <template> Template to use. You can list the templates in a project with "show templates" command.
      [cardKey] Parent card's card key. If defined, new card will be created as a child card to that card.

  create cardType <name> <workflow>, where
      <name> Name for cardType. ${nameGuideline}
      <workflow> Workflow for the card type. You can list workflows in a project with "show workflows" command.

  create fieldType <name> <dataType>, where
      <name> Name for fieldType. ${nameGuideline}
      <dataType> Type of field. You can list field types in a project with "show fieldTypes" command.

  create graphModel <name>, where
      <name> Name for graph model. ${nameGuideline}

  create graphView <name>, where
      <name> Name for graph view. ${nameGuideline}

  create label <cardKey> <labelName>, where
      <cardKey> Card key of the label
      <labelName> Name for the new label

  create link <source> <destination> <linkType> [description], where
      <source> Source card key of the link
      <destination> Destination card key of the link
      <linkType> Link type to create
      [description] Link description

  create linkType <name>, where
      <name> Name for linkType. ${nameGuideline}

  create project <name> <prefix> <path>, where
      <name> Name of the project.
      <prefix> Prefix for the project.
      <path> Path where to create the project

  create report <name>, where
      <name> Name for report. ${nameGuideline}

  create template <name> [content], where
      <name> Name for template. ${nameGuideline}
      [content] If empty, template is created with default values. Template content must conform to schema "templateSchema.json"

  create workflow <name> [content], where
      <name> Name for workflow. ${nameGuideline}
      [content] If empty, workflow is created with default values. Workflow content must conform to schema "workflowSchema.json"

  create <resourceName> [content], where
      <resourceName> Name of the resource (e.g. <prefix>/<type>/<identifier>)
      [content] If empty, resource is created with default values. Content must conform to its resource schema.`;

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

// Main CLI program.
program
  .name('cyberismo')
  .description(packageDef.description)
  .version(packageDef.version)
  .addOption(
    new Option('-L, --log-level <level>', 'Set the log level')
      .choices(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
      .default('fatal'),
  );

// Add card to a template
program
  .command('add')
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
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .option('-r, --repeat <quantity>', 'Add multiple cards to a template')
  .action(
    async (
      template: string,
      cardType: string,
      cardKey: string,
      options: CardsOptions,
    ) => {
      const result = await commandHandler.command(
        Cmd.add,
        [template, cardType, cardKey],
        Object.assign({}, options, program.opts()),
      );
      handleResponse(result);
    },
  );

const calculate = program
  .command('calc')
  .description('Used for running logic programs');

calculate
  .command('generate')
  .description('DEPRECATED: Generate a logic program')
  .argument('[cardKey]', 'If given, calculates on the subtree of the card')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async () => {
    console.warn(
      'This command is deprecated. Use "cyberismo calc run" directly instead.',
    );
  });

calculate
  .command('run')
  .description('Run a logic program')
  .argument('<filePath>', 'Path to the logic program')
  .addOption(contextOption)
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (filePath: string, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.calc,
      ['run', filePath],
      Object.assign({}, options, program.opts()),
    );
    handleResponse(result);
  });

program
  .command('create')
  .argument(
    '<type>',
    `types to create: '${Parser.listTargets('create').join("', '")}', or resource name (e.g. <prefix>/<type>/<identifier>)`,
    Parser.parseCreateTypes,
  )
  .argument(
    '[target]',
    'Name to create, or in some operations cardKey to create data to a specific card. See below',
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
  .addHelpText('after', additionalHelpForCreate)
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(
    async (
      type: string,
      target: string,
      parameter1: string,
      parameter2: string,
      parameter3: string,
      options: CardsOptions,
    ) => {
      if (!type) {
        program.error(`missing required argument <type>`);
      }

      const resourceName: boolean = type.split('/').length === 3;

      function nameOfFirstArgument(type: string) {
        if (type === 'attachment' || type === 'label') return 'cardKey';
        if (type === 'card') return 'template';
        if (type === 'link') return 'source';
        return 'name';
      }

      function nameOfSecondArgument(type: string) {
        if (type === 'attachment') return 'fileName';
        if (type === 'cardType') return 'workflow';
        if (type === 'fieldType') return 'dataType';
        if (type === 'label') return 'labelName';
        if (type === 'link') return 'destination';
        if (type === 'project') return 'prefix';
        return type;
      }

      if (!target && !resourceName) {
        program.error(
          `missing required argument <${nameOfFirstArgument(type)}>`,
        );
      }

      if (
        !resourceName &&
        !parameter1 &&
        type !== 'card' &&
        type !== 'graphModel' &&
        type !== 'graphView' &&
        type !== 'linkType' &&
        type !== 'report' &&
        type !== 'template' &&
        type !== 'workflow'
      ) {
        program.error(
          `missing required argument <${nameOfSecondArgument(type)}>`,
        );
      }

      if (
        resourceName &&
        (type.includes('cardTypes') || type.includes('fieldTypes')) &&
        !target
      ) {
        program.error(
          `missing required argument <${nameOfSecondArgument(type)}>`,
        );
      }

      if (type === 'project') {
        if (!parameter2) {
          program.error(`missing required argument <path>`);
        }
        // Project path must be set to 'options' when creating a project.
        options.projectPath = parameter2;
      }

      const result = await commandHandler.command(
        Cmd.create,
        [type, target, parameter1, parameter2, parameter3],
        Object.assign({}, options, program.opts()),
      );
      handleResponse(result);
    },
  );

// Edit command
program
  .command('edit')
  .description('Edit a card')
  .argument('<cardKey>', 'Card key of card')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (cardKey: string, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.edit,
      [cardKey],
      Object.assign({}, options, program.opts()),
    );
    handleResponse(result);
  });

// Export command
program
  .command('export')
  .description('Export a project or a card')
  .addArgument(
    new Argument('<format>', 'Export format').choices(
      Object.values(ExportFormats),
    ),
  )
  .argument('<output>', 'Output path')
  .argument(
    '[cardKey]',
    'Path to a card. If defined will export only that card and its children instead of whole project.',
  )
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .option('-r, --recursive', 'Export recursively(pdf export only)')
  .option(
    '-t, --title [title]',
    'Title of the exported document(pdf export only)',
  )
  .option('-n, --name [name]', 'Name of the exported document(pdf export only)')
  .option('-d, --date [date]', 'Date of the exported document(pdf export only)')
  .option(
    '-v, --version [version]',
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
      options: CardsOptions,
    ) => {
      if (format === 'site') {
        const progress = new cliProgress.SingleBar(
          {},
          cliProgress.Presets.shades_classic,
        );
        // Should be in commandHandler, once it is moved under the CLI package
        try {
          await exportSite(
            await commandHandler.getProjectPath(options.projectPath),
            output,
            options.logLevel,
            (current: number, total: number) => {
              if (!progress.isActive) {
                progress.start(total, 0);
              }
              if (progress.getTotal() !== total) {
                progress.setTotal(total);
              }
              progress.update(current);
            },
          );
          progress.stop();
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

const importCmd = program.command('import');

// Import module
importCmd
  .command('module')
  .description(
    'Imports another project to this project as a module. Source can be local relative file path, or git HTTPS URL.',
  )
  .argument('<source>', 'Path to import from')
  .argument('[branch]', 'When using git URL defines the branch. Default: main')
  .argument(
    '[useCredentials]',
    'When using git URL uses credentials for cloning. Default: false',
  )
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(
    async (
      source: string,
      branch: string,
      useCredentials: boolean,
      options: CardsOptions,
    ) => {
      const result = await commandHandler.command(
        Cmd.import,
        ['module', source, branch, String(useCredentials)],
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
    'Card key of the parent. If defined, cards are created as children of this card',
  )
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (csvFile: string, cardKey: string, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.import,
      ['csv', csvFile, cardKey],
      Object.assign({}, options, program.opts()),
    );
    handleResponse(result);
  });

// Move command
program
  .command('move')
  .description(
    'Moves a card from root to under another card, from under another card to root, or from under a one card to another.',
  )
  .argument('[source]', 'Source Card key that needs to be moved')
  .argument(
    '[destination]',
    'Destination Card key where "source" is moved to. If moving to root, use "root"',
  )
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(
    async (source: string, destination: string, options: CardsOptions) => {
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

const rank = program.command('rank');

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
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(
    async (cardKey: string, afterCardKey: string, options: CardsOptions) => {
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
    'if null, rebalance the whole project, otherwise rebalance only the direct children of the card key',
  )
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (cardKey: string, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.rank,
      ['rebalance', cardKey],
      Object.assign({}, options, program.opts()),
    );
    handleResponse(result);
  });

// Remove command
program
  .command('remove')
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
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(
    async (
      type: string,
      parameter1: string,
      parameter2: string,
      parameter3: string,
      options: CardsOptions,
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
program
  .command('rename')
  .description(
    'Change project prefix and rename all the content with the new prefix',
  )
  .argument('<to>', 'New project prefix')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (to: string, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.rename,
      [to],
      Object.assign({}, options, program.opts()),
    );
    handleResponse(result);
  });

// Report command
program
  .command('report')
  .description('Runs a report')
  .argument(
    '<parameters>',
    'Path to parameters file. This file defines which report to run and what parameters to use.',
  )
  .argument(
    '[output]',
    'Optional output file; if omitted output will be directed to stdout',
  )
  .addOption(contextOption)
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (parameters: string, output: string, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.report,
      [parameters, output],
      Object.assign({}, options, program.opts()),
    );
    handleResponse(result);
  });

// Show command
program
  .command('show')
  .description('Shows details from a project')
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
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .option(
    '-u --show-use',
    'Show where resource is used. Only used with resources, otherwise will be ignored.',
  )
  .action(async (type: string, typeDetail, options: CardsOptions) => {
    if (type !== '') {
      const result = await commandHandler.command(
        Cmd.show,
        [type, typeDetail],
        Object.assign({}, options, program.opts()),
      );
      handleResponse(result);
    }
  });

// Transition command
program
  .command('transition')
  .description('Transition a card to the specified state')
  .argument('<cardKey>', 'card key of a card')
  .argument(
    '<transition>',
    'Workflow state transition that is done.\nYou can list the workflows in a project with "show workflows" command.\nYou can see the available transitions with "show workflow <name>" command.',
  )
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(
    async (cardKey: string, transition: string, options: CardsOptions) => {
      const result = await commandHandler.command(
        Cmd.transition,
        [cardKey, transition],
        Object.assign({}, options, program.opts()),
      );
      handleResponse(result);
    },
  );

// Update command
program
  .command('update')
  .description('Update resource details')
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
    '-m, --mapping-file [path]',
    'Path to JSON file containing workflow state mapping (only used when changing workflow)',
  )
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .addHelpText('after', additionalHelpForUpdate)
  .action(
    async (
      resourceName: string,
      operation: UpdateOperations,
      key: string,
      value: string,
      newValue: string,
      options: CardsOptions,
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
program
  .command('update-modules')
  .description(
    'Updates to latest versions either all modules or a specific module',
  )
  .argument('[moduleName]', 'Module name')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (moduleName, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.updateModules,
      [moduleName],
      Object.assign({}, options, program.opts()),
      credentials(),
    );
    handleResponse(result);
  });

// Validate command
program
  .command('validate')
  .description('Validate project structure')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (options: CardsOptions) => {
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
program
  .command('app')
  .description(
    'Starts the cyberismo app, accessible with a web browser at http://localhost:3000',
  )
  .option(
    '-w, --watch-resource-changes',
    'Project watches changes in .cards folder resources',
  )
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (options: CardsOptions) => {
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
    startServer(await commandHandler.getProjectPath(options.projectPath));
  });

export default program;
