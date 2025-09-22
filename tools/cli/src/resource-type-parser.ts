/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// Resource types that have commands affecting them.
const Resources = [
  'cardType',
  'calculation',
  'fieldType',
  'graphModel',
  'graphView',
  'linkType',
  'report',
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
