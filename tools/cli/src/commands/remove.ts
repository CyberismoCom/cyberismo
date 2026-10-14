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

import { type Command } from 'commander';

import { removeResource, type Workspace } from '@cyberismo/data-handler';

import {
  CommandWithPath,
  commandTarget,
  commandType,
  hubLocation,
  ResourceTypeParser as Parser,
  Resources,
} from '../lib/args.js';
import { program } from '../lib/program.js';
import { onProject } from '../lib/errors.js';
import {
  cleanNote,
  deprecationNote,
  printResult,
  printResultWithNote,
} from '../lib/output.js';
import type { RemoveCommandOptions } from '../options.js';

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
      <source> Source card key or external item (connector:itemKey)
      <destination> Destination card key or external item (connector:itemKey)
      <linkType> Link type to remove

  remove hub <location>, where
      <location> URL of hub to remove. Use 'default' if removing default hub.

  remove <resourceName>, where
    <resourceName> is <project prefix>/<type>/<identifier>, where
      <project prefix> Prefix for the project.
      <type> is plural form of supported types; e.g. "workflows"
      <identifier> name of a specific resource.
    Note that you cannot remove resources from imported modules.`;

// Removes a card, or a card's attachment, label or link.
async function removeFromCard(
  ws: Workspace,
  type: string,
  cardKey: string,
  args: string[],
) {
  // The argument checks throw inside the write, as the Remove command did.
  const checked = <T>(check: () => void, run: () => Promise<T>) =>
    ws.atomic(async () => {
      check();
      return run();
    }, `Remove ${type} ${cardKey}`);
  if (type === 'attachment') {
    await checked(
      () => {
        if (args.length !== 1 && !args[0]) {
          throw new Error(
            `Input validation error: must pass argument 'detail' if requesting to remove attachment`,
          );
        }
      },
      () => ws.cards.removeAttachment(cardKey, args[0]),
    );
  } else if (type === 'card') {
    await ws.cards.remove(cardKey);
  } else if (type === 'label') {
    await ws.cards.removeLabel(cardKey, args[0]);
  } else {
    await checked(
      () => {
        if ([2, 3].includes(args.length) && !args[0] && !args[1]) {
          throw new Error(
            `Input validation error: must pass arguments 'source', 'destination' and possibly 'linkType' if requesting to remove link`,
          );
        }
      },
      () =>
        ws.cards.removeLink(
          cardKey,
          args[0],
          args[1],
          args[2],
          args[3] as 'outbound' | 'inbound' | undefined,
        ),
    );
  }
}

export async function removeAction(
  type: string,
  parameter1: string | undefined,
  parameter2: string | undefined,
  parameter3: string | undefined,
  options: RemoveCommandOptions,
) {
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
    if (['attachment', 'card', 'label', 'link'].includes(type)) {
      await onProject(Object.assign({}, options, program.opts()), (ws) =>
        removeFromCard(ws, type, parameter1!, [parameter2!, parameter3!]),
      );
      printResult();
      return;
    }

    const commandOptions = Object.assign({}, options, program.opts());
    if (type === 'hub') {
      await onProject(commandOptions, (ws) =>
        ws.settings.hubs.remove(hubLocation(parameter1!)),
      );
      printResult();
      return;
    }
    if (type === 'module') {
      await onProject(commandOptions, (ws) => ws.modules.remove(parameter1!));
      printResult();
      return;
    }
    const removed = commandType(type);
    if (Resources.includes(removed)) {
      const note = await onProject(commandOptions, async (ws) => {
        await removeResource(ws, removed, commandTarget(type, parameter1!));
        // Card types stop declaring a deleted field type, so the values its
        // cards stored are left in place; nothing else removed here can strand
        // a value that 'clean' would find.
        return removed === 'fieldType' ? cleanNote(ws) : undefined;
      });
      printResultWithNote(note);
      return;
    }

    // Unknown types.
    await onProject(commandOptions, async () => {
      throw new Error(`Unknown resource type '${removed}'`);
    });
  }
}

export function registerRemove(program: Command) {
  // Remove command
  const removeCmd = new CommandWithPath('remove').description(
    'Remove cards, resources and other project items',
  );
  program.addCommand(removeCmd);
  removeCmd
    .argument(
      '<type>',
      `removable types: '${Parser.listTargets('remove')
        .filter((type) => type !== 'module')
        .join("', '")}', or resource name (e.g. <prefix>/<type>/<identifier>)`,
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
        options: RemoveCommandOptions,
      ) => {
        if (type === 'module') {
          deprecationNote('remove module', 'module remove');
        }
        await removeAction(type, parameter1, parameter2, parameter3, options);
      },
    );
}
