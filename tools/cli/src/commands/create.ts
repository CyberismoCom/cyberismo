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

import { DEFAULT_HUB } from '@cyberismo/assets';
import { Cmd, type CommandOptions, validBumps } from '@cyberismo/data-handler';

import { CommandGroup, nameGuideline } from '../lib/args.js';
import { commandHandler } from '../lib/dispatch.js';
import { onProject } from '../lib/errors.js';
import { handleResponse, printResult } from '../lib/output.js';
import { checkbox } from '../lib/prompts.js';
import { importableModules } from './module.js';

export function registerCreate(program: Command) {
  const createCmd = new CommandGroup('create').description(
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
        await onProject(Object.assign({}, options, program.opts()), (ws) =>
          ws.cards.addAttachment(cardKey, filename),
        );
        printResult();
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
        // Empty arguments are dropped, shifting the rest left, as ever.
        const [templateName, parent] = [template, parentCardKey].filter(
          Boolean,
        ) as string[];
        const createdCards = await onProject(
          Object.assign({}, options, program.opts()),
          (ws) => ws.cards.create(templateName, parent),
        );
        printResult(
          `Created cards ${JSON.stringify(createdCards.map((card) => card.key))}`,
        );
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
        await onProject(Object.assign({}, options, program.opts()), (ws) =>
          ws.cards.addLabel(cardKey, labelName),
        );
        printResult();
      },
    );

  // Create link subcommand
  createCmd
    .command('link')
    .description(
      'Create a link between two cards, or between a card and an external item. ' +
        'Either source or destination can be external using format "connector:itemKey" (e.g., "jira:INTDEV-1032"). ' +
        'The card always stores the link.',
    )
    .argument(
      '<source>',
      'Source card key or external item (connector:itemKey)',
    )
    .argument(
      '<destination>',
      'Destination card key or external item (connector:itemKey)',
    )
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
        // Empty arguments are dropped, shifting the rest left, as ever.
        const [from, to, type, linkDescription] = [
          source,
          destination,
          linkType,
          description,
        ].filter(Boolean) as string[];
        await onProject(Object.assign({}, options, program.opts()), (ws) =>
          ws.cards.addLink(from, to, type, linkDescription),
        );
        printResult();
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
            // The project already exists at this point and hubs that could be
            // read were still refreshed, so an unreachable hub only narrows the
            // module selection below; it must not fail the creation.
            if (fetchResult.statusCode !== 200) {
              console.warn(
                `Could not fetch hub data - ${fetchResult.message || 'Unknown error'}`,
              );
            }

            // show importable modules
            const choices = await importableModules(commandOptions);
            const selectedModules = await checkbox({
              message: 'Select modules to import',
              theme: { style: { keysHelpTip: (tip: string) => tip } },
              choices,
            });

            // finally, import the selected modules
            const failedModules: string[] = [];
            for (const module of selectedModules) {
              const importResult = await commandHandler.command(
                Cmd.import,
                ['module', module.location, module.private ? 'true' : 'false'],
                commandOptions,
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

  // Create skill subcommand
  createCmd
    .command('skill')
    .description('Create a new skill')
    .argument('<name>', `Name for skill. ${nameGuideline}`)
    .action(async (name: string, options: CommandOptions<'create'>) => {
      const result = await commandHandler.command(
        Cmd.create,
        ['skill', name],
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

  // Create version subcommand
  createCmd
    .command('version')
    .description(
      'Bump the project version in cardsConfig.json and snapshot migration log. The first version is always 1.0.0 regardless of bump type.',
    )
    .addArgument(
      new Argument('<bump>', 'Version bump type').choices([...validBumps]),
    )
    .action(async (bump: string, options: CommandOptions<'version'>) => {
      const result = await commandHandler.command(
        Cmd.version,
        [bump],
        Object.assign({}, options, program.opts()),
      );
      handleResponse(result);
    });
}
