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

import { Argument, type Command } from 'commander';

import {
  createProject,
  validBumps,
  type Workspace,
} from '@cyberismo/data-handler';
import { errorFunction } from '@cyberismo/data-handler/utils/error-utils';
import { resolveTilde } from '@cyberismo/data-handler/utils/file-utils';
import type { DataType } from '@cyberismo/model';

import { CommandGroup, commandType, nameGuideline } from '../lib/args.js';
import { program } from '../lib/program.js';
import { errorMessage, fail, onProject } from '../lib/errors.js';
import { existingAncestor, gitAuthor, openWorkspace } from '../lib/open.js';
import { printResult } from '../lib/output.js';
import { checkbox } from '../lib/prompts.js';
import { importableModules, installModule } from './module.js';
import type {
  AllCommandOptions,
  CreateCommandOptions,
  VersionCommandOptions,
} from '../options.js';

// Each resource type's create, from the arguments after the type.
const resourceCreates: Record<
  string,
  (ws: Workspace, args: string[]) => Promise<void>
> = {
  cardType: (ws, [name, workflow]) =>
    ws.resources.create(name, 'cardTypes', { workflow }),
  fieldType: (ws, [name, datatype]) =>
    ws.resources.create(name, 'fieldTypes', {
      dataType: datatype as DataType,
    }),
  graphModel: (ws, [name]) => ws.resources.create(name, 'graphModels', {}),
  graphView: (ws, [name]) => ws.resources.create(name, 'graphViews', {}),
  calculation: (ws, [name]) => ws.resources.create(name, 'calculations', {}),
  linkType: (ws, [name]) => ws.resources.create(name, 'linkTypes', {}),
  report: (ws, [name]) => ws.resources.create(name, 'reports', {}),
  skill: (ws, [name]) => ws.resources.create(name, 'skills', {}),
  template: (ws, [name, content]) =>
    ws.resources.create(name, 'templates', {
      content: content ? JSON.parse(content) : undefined,
    }),
  workflow: (ws, [name, content]) =>
    ws.resources.create(name, 'workflows', {
      content: content ? JSON.parse(content) : undefined,
    }),
};

// The resource type 'create resource' was given, if it names one.
function resourceTarget(type: string | undefined): string | undefined {
  try {
    const target = commandType(type!);
    return Object.hasOwn(resourceCreates, target) ? target : undefined;
  } catch {
    // Not a name; the unknown-type branch reports it.
    return undefined;
  }
}

// Creates a project at 'path' from [name, prefix, category, description],
// printing what did not happen; a failure exits.
async function createProjectAt(
  path: string,
  args: (string | undefined)[],
  options: AllCommandOptions,
  skipDefaultHub = false,
) {
  const [name, prefix, category, description] = args;
  const projectPath = resolveTilde(path);
  const { actor, identity } = await gitAuthor(existingAncestor(projectPath));
  const { failures, warnings } = await createProject(
    projectPath,
    {
      name: name!,
      prefix: prefix!,
      category: category || '',
      description: description || '',
      skipDefaultHub,
    },
    actor,
    identity,
    {
      logLevel: options.logLevel,
      autocommit: options.autocommit,
      autopush: options.autopush,
    },
  ).catch((error: unknown) => fail(errorFunction(error)));
  for (const warning of warnings) {
    console.warn(warning);
  }
  if (failures.length > 0) {
    fail(failures.join('\n'));
  }
}

async function createResource(
  options: CreateCommandOptions,
  type: string,
  args: string[],
) {
  await onProject(Object.assign({}, options, program.opts()), (ws) =>
    resourceCreates[type](ws, args),
  );
  printResult();
}

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
        options: CreateCommandOptions,
      ) => {
        await onProject(
          Object.assign({}, options, program.opts()),
          async (ws) =>
            ws.cards.addAttachment(
              cardKey,
              filename,
              await readFile(filename).catch(() => {
                throw new Error(`Attachment file not found: ${filename}`);
              }),
            ),
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
        options: CreateCommandOptions,
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
      async (name: string, workflow: string, options: CreateCommandOptions) => {
        await createResource(options, 'cardType', [name, workflow]);
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
      async (name: string, dataType: string, options: CreateCommandOptions) => {
        await createResource(options, 'fieldType', [name, dataType]);
      },
    );

  // Create graphModel subcommand
  createCmd
    .command('graphModel')
    .description('Create a new graph model')
    .argument('<name>', `Name for graph model. ${nameGuideline}`)
    .action(async (name: string, options: CreateCommandOptions) => {
      await createResource(options, 'graphModel', [name]);
    });

  // Create graphView subcommand
  createCmd
    .command('graphView')
    .description('Create a new graph view')
    .argument('<name>', `Name for graph view. ${nameGuideline}`)
    .action(async (name: string, options: CreateCommandOptions) => {
      await createResource(options, 'graphView', [name]);
    });

  // Create calculation subcommand
  createCmd
    .command('calculation')
    .description('Create a new calculation')
    .argument('<name>', `Name for calculation. ${nameGuideline}`)
    .action(async (name: string, options: CreateCommandOptions) => {
      await createResource(options, 'calculation', [name]);
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
        options: CreateCommandOptions,
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
        options: CreateCommandOptions,
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
    .action(async (name: string, options: CreateCommandOptions) => {
      await createResource(options, 'linkType', [name]);
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
        options: CreateCommandOptions,
      ) => {
        // Project path must be set to 'options' when creating a project
        options.projectPath = path;
        const commandOptions = Object.assign({}, options, program.opts());

        await createProjectAt(
          commandOptions.projectPath || '',
          [name, prefix, category, description],
          commandOptions,
          commandOptions.skipModuleImport,
        );

        // Post-handling after creating a new project
        if (!commandOptions.skipModuleImport) {
          try {
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
              try {
                await openWorkspace(commandOptions).then((ws) =>
                  installModule(ws, module.location, {
                    private: !!module.private,
                  }),
                );
              } catch (error) {
                console.warn(
                  `Failed to import module '${module.name}':`,
                  errorMessage(error) || 'Unknown error',
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

        printResult();
      },
    );

  // Create report subcommand
  createCmd
    .command('report')
    .description('Create a new report')
    .argument('<name>', `Name for report. ${nameGuideline}`)
    .action(async (name: string, options: CreateCommandOptions) => {
      await createResource(options, 'report', [name]);
    });

  // Create skill subcommand
  createCmd
    .command('skill')
    .description('Create a new skill')
    .argument('<name>', `Name for skill. ${nameGuideline}`)
    .action(async (name: string, options: CreateCommandOptions) => {
      await createResource(options, 'skill', [name]);
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
        options: CreateCommandOptions,
      ) => {
        // Empty arguments are dropped, shifting the rest left, as ever.
        await createResource(
          options,
          'template',
          [name, content].filter(Boolean) as string[],
        );
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
        options: CreateCommandOptions,
      ) => {
        // Empty arguments are dropped, shifting the rest left, as ever.
        await createResource(
          options,
          'workflow',
          [name, content].filter(Boolean) as string[],
        );
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
        options: CreateCommandOptions,
      ) => {
        // Empty arguments are dropped, shifting the rest left, as ever.
        const args = [resourceName, content].filter(Boolean) as string[];
        const target = resourceTarget(args[0]);
        if (target) {
          // A resource name stays the first argument.
          await createResource(
            options,
            target,
            target !== args[0] ? args : args.slice(1),
          );
          return;
        }
        if (args[0] === 'project') {
          await createProjectAt(
            options.projectPath || '',
            args.slice(1),
            Object.assign({}, options, program.opts()),
          );
          printResult();
          return;
        }
        // Unknown types.
        await onProject(Object.assign({}, options, program.opts()), () => {
          throw new Error(`Unknown type to create: '${commandType(args[0])}'`);
        });
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
    .action(async (bump: string, options: VersionCommandOptions) => {
      const result = await onProject(
        Object.assign({}, options, program.opts()),
        (ws) => ws.versions.bump(bump as (typeof validBumps)[number]),
      );
      const previousInfo = result.previousVersion
        ? ` (was v${result.previousVersion})`
        : '';
      printResult(`Bumped to v${result.newVersion}${previousInfo}`);
    });
}
