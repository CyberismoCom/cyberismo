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
  ShowTypes,
  UpdateOperations,
} from '@cyberismocom/data-handler';

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
    console.error(response.message);
  }
}

function parseTypes(types: string[], value: string): string {
  if (types.includes(value)) {
    return value;
  }
  console.error(`Unknown type: '${value}'`);
  console.error('Supported types are: ' + types.join(', '));
  return '';
}

// Parse allowed types for show command.
function parseSupportedTypes(value: string): string {
  return parseTypes(ShowTypes.all(), value);
}

// Commander
const program = new Command();

// CLI command handler
const commandHandler = new Commands();

// Ensure that all names have the same guideline.
const nameGuideline =
  '\nName can contain letters (a-z|A-Z), spaces, underscores or hyphens.';
const pathGuideline =
  'Path to the project root. Mandatory if not running inside a project tree.';

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

// Create command and the subcommands
const create = program.command('create');

// Create attachment
create
  .command('attachment')
  .description('Create an attachment to a card')
  .argument('<cardKey>', 'Card key of card')
  .argument('<attachment>', 'Full path to an attachment')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(
    async (cardKey: string, attachment: string, options: CardsOptions) => {
      const result = await commandHandler.command(
        Cmd.create,
        ['attachment', cardKey, attachment],
        options,
      );
      handleResponse(result);
    },
  );

// Create card
create
  .command('card')
  .description('Create a card')
  .argument(
    '<template>',
    'Template to use. \nYou can list the templates in a project with "show templates" command.',
  )
  .argument(
    '[cardKey]',
    "Parent card's card key. If defined, new card will be created as a child card to that card.",
  )
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (template: string, cardKey: string, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.create,
      ['card', template, cardKey],
      options,
    );
    handleResponse(result);
  });

// Create card type
create
  .command('cardType')
  .description('Create a card type')
  .argument('<name>', `Name for card type. ${nameGuideline}`)
  .argument(
    '<workflow>',
    'Workflow for the card type. \nYou can list workflows in a project with "show workflows" command.',
  )
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (name, workflow, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.create,
      ['cardType', name, workflow],
      options,
    );
    handleResponse(result);
  });

// Create fieldType
create
  .command('fieldType')
  .description('Create a field type')
  .argument('<name>', `Name for field type. ${nameGuideline}`)
  .argument(
    '<datatype>',
    'Type of field. \nYou can list field types in a project with "show fieldTypes" command.',
  )
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (name, datatype, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.create,
      ['fieldType', name, datatype],
      options,
    );
    handleResponse(result);
  });

create
  .command('label')
  .description('Create a label')
  .argument('<cardKey>', 'Key of the card that the label will be added to')
  .argument('<label>', `Name of the created label. ${nameGuideline}`)
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (cardKey: string, label: string, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.create,
      ['label', cardKey, label],
      options,
    );
    handleResponse(result);
  });
create
  .command('link')
  .description('Create a link')
  .argument('<source>', 'Source card key of the link')
  .argument('<destination>', 'Destination card key of the link')
  .argument(
    '<linkType>',
    'Link type. \nYou can list link types in a project with "show linkTypes" command.',
  )
  .argument('[description]', 'Description of the link')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(
    async (
      source: string,
      destination: string,
      linkType: string,
      description: string,
      options: CardsOptions,
    ) => {
      const result = await commandHandler.command(
        Cmd.create,
        ['link', source, destination, linkType, description],
        options,
      );
      handleResponse(result);
    },
  );

// Create link type
create
  .command('linkType')
  .description('Create a link type')
  .argument('<name>', `Name for link type. ${nameGuideline}`)
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (name, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.create,
      ['linkType', name],
      options,
    );
    handleResponse(result);
  });

// Create project
create
  .command('project')
  .argument('<name>', `Name for project. ${nameGuideline}`)
  .argument(
    '<prefix>',
    "Prefix that will be part of each card's card key. Prefix can be 3-10 characters (a-z)",
  )
  .argument(
    '<path>',
    'Path where project is created. \nNote that folder is automatically created.',
  )
  .description('Create a project')
  .action(async (name, prefix, path) => {
    const result = await commandHandler.command(
      Cmd.create,
      ['project', name, prefix],
      { projectPath: path },
    );
    handleResponse(result);
  });

// Create template
create
  .command('template')
  .description('Create a template')
  .argument('<name>', `Name for template. ${nameGuideline}`)
  .argument(
    '[content]',
    'If empty, template is created with default values. \nTemplate content must conform to schema "templateSchema.json"',
  )
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (name: string, content: string, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.create,
      ['template', name, content],
      options,
    );
    handleResponse(result);
  });

// Create workflow
create
  .command('workflow')
  .description('Create a workflow')
  .argument('<name>', `Name for the workflow. ${nameGuideline}`)
  .argument(
    '[content]',
    'If empty, workflow is created with default values. \nWorkflow content must conform to schema "workflowSchema.json"',
  )
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (name: string, content: string, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.create,
      ['workflow', name, content],
      options,
    );
    handleResponse(result);
  });

create
  .command('report')
  .description('Create a report')
  .argument('<name>', `Name for the report. ${nameGuideline}`)
  .option('-p, --project-path [path]', pathGuideline)
  .action(async (name: string, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.create,
      ['report', name],
      options,
    );
    handleResponse(result);
  });

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
const remove = program.command('remove');
remove
  .command('attachment')
  .argument('<cardKey>', 'Card key of the owning card')
  .argument('<filename>', 'attachment filename')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (cardKey: string, filename: string, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.remove,
      ['attachment', cardKey, filename],
      options,
    );
    handleResponse(result);
  });

remove
  .command('card')
  .argument('<cardKey>', 'Card key of card to remove')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (cardKey: string, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.remove,
      ['card', cardKey],
      options,
    );
    handleResponse(result);
  });

remove
  .command('cardType')
  .argument('<name>', 'Name of the card type to remove')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (name: string, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.remove,
      ['cardType', name],
      options,
    );
    handleResponse(result);
  });

remove
  .command('fieldType')
  .argument('<name>', 'Name of the field type to remove')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (name: string, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.remove,
      ['fieldType', name],
      options,
    );
    handleResponse(result);
  });

remove
  .command('label')
  .argument('<cardKey>', 'Source card key of the link')
  .argument('[label]', 'Label being removed')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (cardKey: string, label: string, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.remove,
      ['label', cardKey, label],
      options,
    );
    handleResponse(result);
  });

remove
  .command('link')
  .argument('<source>', 'Source card key of the link')
  .argument('<destination>', 'Destination card key of the link')
  .argument('<linkType>', 'Link type')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(
    async (
      source: string,
      destination: string,
      linkType: string,
      options: CardsOptions,
    ) => {
      const result = await commandHandler.command(
        Cmd.remove,
        ['link', source, destination, linkType],
        options,
      );
      handleResponse(result);
    },
  );

remove
  .command('linkType')
  .argument('<name>', 'Name of the link type to remove')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (name: string, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.remove,
      ['linkType', name],
      options,
    );
    handleResponse(result);
  });

remove
  .command('module')
  .argument('<name>', 'Name of the module to remove')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (name: string, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.remove,
      ['module', name],
      options,
    );
    handleResponse(result);
  });

remove
  .command('report')
  .argument('<name>', 'Name of the report to remove')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (name: string, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.remove,
      ['report', name],
      options,
    );
    handleResponse(result);
  });

remove
  .command('template')
  .argument('<name>', 'Name of the template to remove')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (name: string, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.remove,
      ['template', name],
      options,
    );
    handleResponse(result);
  });

remove
  .command('workflow')
  .argument('<name>', 'Name of the workflow to remove')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (name: string, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.remove,
      ['workflow', name],
      options,
    );
    handleResponse(result);
  });

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
  .description('Shows resource types in a project')
  .argument(
    '<type>',
    'resource types: attachments, card, cards, cardType, cardTypes, labels, linkType, linkTypes, project, report, reports, template, templates, workflow, workflows',
    parseSupportedTypes,
  )
  .argument(
    '[typeDetail]',
    'additional information about the requested type; for example a card key',
  )
  .option(
    '-d --details',
    'Certain resources (such as cards) can have additional details',
  )
  .option('-p, --project-path [path]', `${pathGuideline}`)
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
