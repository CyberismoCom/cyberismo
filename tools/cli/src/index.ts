#!/usr/bin/env node
/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Argument, Command } from 'commander';
import {
  CardsOptions,
  Cmd,
  Commands,
  ExportFormats,
  requestStatus,
  UpdateOperations,
} from '@cyberismocom/data-handler';
import { ResourceTypeParser as Parser } from './resource-type-parser.js';

// To avoid duplication, fetch description and version from package.json file.
// Importing dynamically allows filtering of warnings in cli/bin/run.
const packageDef = (await import('../package.json', { with: { type: 'json' } }))
  .default;

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

// Main CLI program.
program
  .name('cyberismo')
  .description(packageDef.description)
  .version(packageDef.version);

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
        options,
      );
      handleResponse(result);
    },
  );

const calculate = program
  .command('calc')
  .description('Used for running logic programs');

calculate
  .command('generate')
  .description('Generate a logic program')
  .argument('[cardKey]', 'If given, calculates on the subtree of the card')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (filePath: string, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.calc,
      ['generate', filePath],
      options,
    );
    handleResponse(result);
  });

calculate
  .command('run')
  .description('Run a logic program')
  .argument('<filePath>', 'Path to the logic program')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (filePath: string, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.calc,
      ['run', filePath],
      options,
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
        options,
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
    const result = await commandHandler.command(Cmd.edit, [cardKey], options);
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
  .option(
    '-t, --theme-path [path]',
    `Path to a custom theme / UI bundle (site export only)`,
  )
  .action(
    async (
      format: string,
      output: ExportFormats,
      cardKey: string,
      options: CardsOptions,
    ) => {
      const result = await commandHandler.command(
        Cmd.export,
        [format, output, cardKey],
        options,
      );
      handleResponse(result);
    },
  );

const importCmd = program.command('import');

// Import module
importCmd
  .command('module')
  .description('Imports another project to this project as a module.')
  .argument('<source>', 'Path to import from')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (source: string, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.import,
      ['module', source],
      options,
    );
    handleResponse(result);
  });

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
      options,
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
        options,
      );
      handleResponse(result);
    },
  );

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
        options,
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
      options,
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
          options,
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
    const result = await commandHandler.command(Cmd.rename, [to], options);
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
        options,
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
        options,
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
  .argument('[newValue]', 'When using "change" define new value for detail')
  .action(
    async (
      resourceName: string,
      key: string,
      operation: UpdateOperations,
      value: string,
      newValue: string,
      options: CardsOptions,
    ) => {
      const result = await commandHandler.command(
        Cmd.update,
        [resourceName, key, operation, value, newValue],
        options,
      );
      handleResponse(result);
    },
  );

// Validate command
program
  .command('validate')
  .description('Validate project structure')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (options: CardsOptions) => {
    const result = await commandHandler.command(Cmd.validate, [], options);
    handleResponse(result);
  });

// Start app command
program
  .command('app')
  .description(
    'Starts the cyberismo app, accessible with a web browser at http://localhost:3000',
  )
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (options: CardsOptions) => {
    const result = await commandHandler.command(Cmd.start, [], options);
    handleResponse(result);
  });

export default program;
