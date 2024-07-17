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
  requestStatus,
} from '@cyberismocom/data-handler';

// Handle the response object from data-handler
function handleResponse(response: requestStatus) {
  if (response.statusCode === 200) {
    if (response.payload) {
      console.log(response.payload);
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
  return parseTypes(commandHandler.allAllowedTypes(), value);
}

// Parse allowed types for remove command.
function parseRemovableTypes(value: string): string {
  return parseTypes(Commands.removableTypes, value);
}

// Parse allowed subcommands for calc command.
function parseCalcSubCommands(value: string): string {
  if (value === 'run' || value === 'generate') {
    return value;
  }
  console.error(`Unknown subcommand: '${value}'`);
  console.error('Supported subcommands for "calc" are: generate, run');
  return '';
}

// Commander
const program = new Command();

// Cards command handler
const commandHandler = new Commands();

// Ensure that all names have the same guideline.
const nameGuideline =
  '\nName can contain letters (a-z|A-Z), spaces, underscores or hyphens.';
const pathGuideline =
  'Path to the project root. Mandatory if not running inside a project tree.';
const subCalcCommandGuideline =
  'Supported subcommands are: \n"generate" that generates a new logic program, \n"run" that executes already generated logic program.';

program.name('cards').description('CLI tool to handle tasks.').version('1.0.0');

// Add card to a template
program
  .command('add')
  .description('Add card to a template')
  .argument(
    '<template>',
    'Template for a new card. \nYou can list the templates in a project with "show templates" command.',
  )
  .argument(
    '<cardtype>',
    'Cardtype to use for the new card. \nYou can list the cardtypes in a project with "show cardtypes" command.',
  )
  .argument('[cardkey]', "Parent card's cardkey")
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .option('-r, --repeat <quantity>', 'Add multiple cards to a template')
  .action(
    async (
      template: string,
      cardtype: string,
      cardkey: string,
      options: CardsOptions,
    ) => {
      const result = await commandHandler.command(
        Cmd.add,
        [template, cardtype, cardkey],
        options,
      );
      handleResponse(result);
    },
  );

// Calculate - both generate a logic program and execute one.
program
  .command('calc')
  .description('Either generates or runs a logic program.')
  .argument('<subcommand>', subCalcCommandGuideline, parseCalcSubCommands)
  .argument(
    '[cardkey]',
    'Cardkey of card; if omitted "calc generate" affects the whole cardtree. "calc run" always needs "card key"',
  )
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .option('-g, --ground-only', 'Only for "run"; ...')
  .option('-s, --solve-only', 'Only for "run"; ...')
  .action(
    async (subcommand: string, cardkey: string, options: CardsOptions) => {
      if (subcommand !== '') {
        const result = await commandHandler.command(
          Cmd.calc,
          [subcommand, cardkey],
          options,
        );
        handleResponse(result);
      }
    },
  );

// Create command and the subcommands
const create = program.command('create');

// Create attachment
create
  .command('attachment')
  .description('Create an attachment to a cardkey')
  .argument('<cardkey>', 'Cardkey of card')
  .argument('<attachment>', 'Full path to an attachment')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(
    async (cardkey: string, attachment: string, options: CardsOptions) => {
      const result = await commandHandler.command(
        Cmd.create,
        ['attachment', cardkey, attachment],
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
    '[cardkey]',
    "Parent card's cardkey. If defined, new card will be created as a child card of that card.",
  )
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (template: string, cardkey: string, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.create,
      ['card', template, cardkey],
      options,
    );
    handleResponse(result);
  });

// Create cardtype
create
  .command('cardtype')
  .description('Create a card type')
  .argument('<name>', `Name for card type. ${nameGuideline}`)
  .argument(
    '<workflow>',
    'Workflow for the card type. \nYou can list the workflows in a project with "show workflows" command.',
  )
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (name, workflow, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.create,
      ['cardtype', name, workflow],
      options,
    );
    handleResponse(result);
  });

// Create fieldType
create
  .command('fieldtype')
  .description('Create a field type')
  .argument('<name>', `Name for field type. ${nameGuideline}`)
  .argument('<datatype>', 'Type of field')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (name, datatype, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.create,
      ['fieldtype', name, datatype],
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
    "Prefix that will be part of each card's cardkey. Prefix can be 3-10 characters (A-Z)",
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
    'If empty, template is created with default values. \nTemplate content must conform to schema template-schema.json',
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
    'If empty, workflow is created with default values. \nWorkflow content must conform to schema workflow-schema.json',
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

// Edit command
program
  .command('edit')
  .description('Edit a card')
  .argument('<cardkey>', 'Cardkey of card')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (cardkey: string, options: CardsOptions) => {
    const result = await commandHandler.command(Cmd.edit, [cardkey], options);
    handleResponse(result);
  });

// Export command
program
  .command('export')
  .description('Export a project or a card')
  .addArgument(
    new Argument('<format>', 'Export format').choices([
      'adoc',
      'csv',
      'html',
      'pdf',
      'site',
    ]),
  )
  .argument('<output>', 'Output path')
  .argument('[cardkey]', 'Path to card')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(
    async (
      format: string,
      output: string,
      cardkey: string,
      options: CardsOptions,
    ) => {
      const result = await commandHandler.command(
        Cmd.export,
        [format, output, cardkey],
        options,
      );
      handleResponse(result);
    },
  );

const importCmd = program.command('import');

// Import module
importCmd
  .command('module')
  .description('Imports another project to this project.')
  .argument('<source>', 'Path to import from')
  .argument('<name>', 'Name for the import in this project')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (source: string, name: string, options: CardsOptions) => {
    const result = await commandHandler.command(
      Cmd.import,
      ['module', source, name],
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
    'Card key of the parent. If defined, cards are created as a child',
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

// todo: Link command

// Move command
program
  .command('move')
  .description(
    'Moves a card from root to under another card, from under another card to root, or from under a one card to another.',
  )
  .argument('[source]', 'Source Cardkey that needs to be moved')
  .argument(
    '[destination]',
    'Destination Cardkey where "source" is moved to. If moving to root, use "root"',
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

// Remove command
program
  .command('remove')
  .description('Removes a card, a template or an attachment')
  .argument(
    '<type>',
    `Possible types: ${Commands.removableTypes.join(', ')}`,
    parseRemovableTypes,
  )
  .argument(
    '<targetName>',
    'Resource that should be removed; template name or cardkey. If removing an attachment, define cardkey of owning card.',
  )
  .argument('[detail]', 'attachment name to remove')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(
    async (
      type: string,
      targetName: string,
      detail: string,
      options: CardsOptions,
    ) => {
      if (type !== '') {
        const result = await commandHandler.command(
          Cmd.remove,
          [type, targetName, detail],
          options,
        );
        handleResponse(result);
      }
    },
  );

// Rename command
program
  .command('rename')
  .description('Change project prefix and rename all cards with the new prefix')
  .argument('<to>', 'New project prefix')
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (to: string, options: CardsOptions) => {
    const result = await commandHandler.command(Cmd.rename, [to], options);
    handleResponse(result);
  });

// Show command
// todo: add later support for more types: link
program
  .command('show')
  .description('Shows resource types in a project')
  .argument(
    '<type>',
    'resource types: attachments, card, cards, cardtype, cardtypes, project, template, templates, workflow, workflows',
    parseSupportedTypes,
  )
  .argument(
    '[typeDetail]',
    'additional information about the requested type; for example a cardkey',
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
  .argument('<cardkey>', 'cardkey of a card')
  .argument(
    '<transition>',
    'Workflow state transition that is done.\nYou can list the workflows in a project with "show workflows" command.\nYou can see the available transitions with "show workflow <name>" command.',
  )
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(
    async (cardkey: string, transition: string, options: CardsOptions) => {
      const result = await commandHandler.command(
        Cmd.transition,
        [cardkey, transition],
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
    'Starts the cards app, accessible with a web browser at http://localhost:3000',
  )
  .option('-p, --project-path [path]', `${pathGuideline}`)
  .action(async (options: CardsOptions) => {
    const result = await commandHandler.command(Cmd.start, [], options);
    handleResponse(result);
  });

export default program;
