// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { Command, Option } from 'commander';

import { DEFAULT_HUB } from '@cyberismo/assets';
import { resourceName } from '@cyberismo/data-handler';
import { validContexts } from '@cyberismo/model';

// Resource types that have commands affecting them.
export const Resources = [
  'calculation',
  'cardType',
  'fieldType',
  'graphModel',
  'graphView',
  'linkType',
  'report',
  'skill',
  'template',
  'workflow',
];

// Lookup table for plural forms for command targets that have plural form commands.
const pluralLookUpForResources = new Map([
  ['calculation', 'calculations'],
  ['cardType', 'cardTypes'],
  ['fieldType', 'fieldTypes'],
  ['graphModel', 'graphModels'],
  ['graphView', 'graphViews'],
  ['linkType', 'linkTypes'],
  ['report', 'reports'],
  ['skill', 'skills'],
  ['template', 'templates'],
  ['workflow', 'workflows'],
]);

// Default 'sort' puts Uppercase before lowercase.
// Make sorting case-independent.
// @todo: This could be in some util file.
function alphabeticalOrder(a: string, b: string) {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  if (aLower < bLower) return -1;
  if (aLower > bLower) return 1;
  return 0;
}

/**
 * Class that helps parsing 'create', 'remove' and 'show' commands.
 */
abstract class CreateTypes {
  private static ResourceTypes = Resources;

  // Command specific additions; these can also be affected with 'create'.
  private static ResourceLikeTypes = [
    'attachment',
    'card',
    'label',
    'link',
    'project',
  ];

  private static TargetTypes = [
    ...CreateTypes.ResourceTypes,
    ...CreateTypes.ResourceLikeTypes,
  ].sort(alphabeticalOrder);

  // For create command, this is only used in cases where resource name is provided to the command.
  // e.g. "cyberismo remove demo/workflows/controlledDocument"
  public static pluralLookupTable = new Map([...pluralLookUpForResources]);

  // Lists all create-able resource types.
  public static all(): string[] {
    return CreateTypes.TargetTypes;
  }
}

// Helper class for show command types.
abstract class ShowTypes {
  private static ResourceTypes = Resources;

  // Command specific additions; these can also be shown with 'show'.
  private static ResourceLikeTypes = [
    'attachments',
    'card',
    'cards',
    'hubs',
    'importableModules',
    'labels',
    'module',
    'project',
  ];

  private static TargetTypes = [
    ...ShowTypes.ResourceTypes,
    ...ShowTypes.ResourceLikeTypes,
  ];

  public static pluralLookupTable = new Map([
    ...pluralLookUpForResources,
    ['module', 'modules'],
  ]);

  // Lists all show-able resource types.
  public static all(): string[] {
    return [
      ...ShowTypes.pluralLookupTable.values(),
      ...ShowTypes.TargetTypes,
    ].sort(alphabeticalOrder);
  }
}

// Helper class for remove command types.
// Note that remove command is never used with plural names.
abstract class RemoveTypes {
  private static ResourceTypes = Resources;

  // Command specific additions; these can also be affected with 'remove'.
  private static ResourceLikeTypes = [
    'attachment',
    'card',
    'hub',
    'label',
    'link',
    'module',
  ];

  private static TargetTypes = [
    ...RemoveTypes.ResourceLikeTypes,
    ...RemoveTypes.ResourceTypes,
  ].sort(alphabeticalOrder);

  // For remove command, this is only used in cases where resource name is provided to the command.
  // e.g. "cyberismo remove demo/workflows/controlledDocument"
  public static pluralLookupTable = new Map([...pluralLookUpForResources]);

  // Lists all remove-able resource types.
  public static all(): string[] {
    return RemoveTypes.TargetTypes;
  }
}

// Parser that helps with certain commands that are related to resources (create, show, remove).
export class ResourceTypeParser {
  private static parseTypes(
    types: string[],
    value: string,
    pluralValues: Map<string, string>,
  ): string {
    // Known type.
    if (types.includes(value)) {
      return value;
    }

    // If it wasn't a known type, maybe it is a resource name
    const parts = value.split('/');
    if (parts && parts.length === 3) {
      const type = parts.at(1) || '';
      if (types.includes(type)) {
        return value;
      } else {
        for (const plural of pluralValues.values()) {
          if (type === plural) {
            return value;
          }
        }
      }
    }
    throw new Error(`Unknown type: '${value}'.\nSupported types are: '${types.join("', '")}'. Alternatively provide resource name (e.g "cyberismo show <prefix/type/identifier>").
  `);
  }

  private static command(value: string) {
    let typeValue;
    if (value === 'remove') typeValue = RemoveTypes;
    if (value === 'show') typeValue = ShowTypes;
    if (value === 'create') typeValue = CreateTypes;
    if (!typeValue) throw new Error('Unsupported command: ' + value);
    return typeValue;
  }

  private static parseCommandTypes(type: string, category: string): string {
    const commandType = ResourceTypeParser.command(category);
    return ResourceTypeParser.parseTypes(
      commandType.all(),
      type,
      commandType.pluralLookupTable,
    );
  }

  /**
   * Returns type targets related to 'command'.
   * @param command command that targets need to be fetched to ('create', 'show', ...)
   * @returns Array of type targets related to 'command'.
   */
  public static listTargets(command: string): string[] {
    return ResourceTypeParser.command(command).all();
  }

  /**
   * Parses remove command.
   * @param type Argument 'type' from a command.
   * @returns 'type' if it is a valid value. Throws if not.
   */
  public static parseRemoveTypes(type: string): string {
    return ResourceTypeParser.parseCommandTypes(type, 'remove');
  }

  /**
   * Parses create command.
   * @param type Argument 'type' from a command.
   * @returns 'type' if it is a valid value. Throws if not.
   */
  public static parseCreateTypes(type: string): string {
    return ResourceTypeParser.parseCommandTypes(type, 'create');
  }

  /**
   * Parses show command.
   * @param type Argument 'type' from a command.
   * @returns 'type' if it is a valid value. Throws if not.
   */
  public static parseShowTypes(type: string): string {
    return ResourceTypeParser.parseCommandTypes(type, 'show');
  }
}

// The type a 'create', 'remove' or 'show' type argument names: a resource
// name's type in singular, else the argument itself.
export function commandType(type: string): string {
  const resource = resourceName(type);
  return resource.type.substring(0, resource.type.length - 1) || type;
}

// The resource a type argument names: the argument when it is a resource
// name, else 'target'.
export function commandTarget(type: string, target: string): string {
  return resourceName(type).type ? type : target;
}

// A hub location argument; 'default' names the default hub.
export function hubLocation(location: string): string {
  return location === 'default' ? DEFAULT_HUB : location;
}

// Ensure that all names have the same guideline.
export const nameGuideline =
  'Name can contain letters (a-z|A-Z), spaces, underscores or hyphens.';
export const pathGuideline =
  'Path to the project root. Mandatory if not running inside a project tree.';

// Splits a "source@version" argument into source and version parts.
// Leaves the "@" in SSH URLs like "git@github.com:foo/bar.git" intact by
// only considering "@" that appears after the host:path separator.
export function parseSourceAtVersion(input: string): {
  source: string;
  version?: string;
} {
  let searchFrom = 0;
  if (input.startsWith('git@')) {
    const colonIdx = input.indexOf(':');
    searchFrom = colonIdx >= 0 ? colonIdx : input.length;
  }
  const atIdx = input.lastIndexOf('@');
  if (atIdx > searchFrom) {
    const version = input.slice(atIdx + 1);
    return {
      source: input.slice(0, atIdx),
      version: version || undefined,
    };
  }
  return { source: input };
}

export const contextOption = new Option(
  '-c, --context [context]',
  'Context to run the logic programs in.',
)
  .choices(validContexts)
  .default('commandLine');

const pathOption = new Option('-p, --project-path <path>', pathGuideline);

// Custom Command class with pathOption pre-configured
export class CommandWithPath extends Command {
  createCommand(name?: string): CommandWithPath {
    return new CommandWithPath(name);
  }

  constructor(name?: string) {
    super(name);
    this.addOption(pathOption);
  }
}

// Groups that only host subcommands must not own the path option themselves:
// Commander lets a parent consume its own options anywhere in argv, so "-p"
// would never reach the leaf command.
export class CommandGroup extends Command {
  createCommand(name?: string): CommandWithPath {
    return new CommandWithPath(name);
  }
}
