/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import type { ErrorObject } from 'ajv';
import type { ErrorCode } from '@cyberismo/model';

/**
 * An error the edges (HTTP, CLI) map by its 'code'. 'details' is wire-safe
 * context for the response body.
 */
export abstract class DomainError extends Error {
  abstract readonly code: ErrorCode;
  public details?: Record<string, unknown>;
}

export class DHValidationError extends DomainError {
  readonly code = 'validation';
  public errors?: ErrorObject[];
  constructor(message: string, errors?: ErrorObject[]) {
    super(message);
    this.name = 'DHValidationError';
    this.errors = errors;
  }
}

export class SchemaNotFound extends DomainError {
  readonly code = 'schema-not-found';
  constructor(message: string) {
    super(message);
    this.name = 'SchemaNotFound';
  }
}

/** A module request that cannot be served. */
export class ModuleRequestError extends DomainError {
  readonly code = 'module-request';
  constructor(
    message: string,
    /** Redacted git text for CLI users; never for API responses. */
    public readonly detail?: string,
  ) {
    super(message);
    this.name = 'ModuleRequestError';
  }
}

/** Git errors quote the remote URL, which may carry credentials. */
export function redactUserinfo(message: string): string {
  return message.replace(/\/\/[^/\s]*@/g, '//');
}

/** A module source that could not be reached; git's text is kept as redacted detail. */
export function unreachable(
  name: string,
  cause?: unknown,
  action = 'check for updates',
): ModuleRequestError {
  return new ModuleRequestError(
    `Couldn't ${action}: '${name}' is unreachable`,
    cause instanceof Error ? redactUserinfo(cause.message) : undefined,
  );
}

/**
 * Thrown when a card is not in the project, or not in the named container.
 * @param container 'project' or a template's name; the project when omitted.
 */
export class CardNotFoundError extends DomainError {
  readonly code = 'not-found';
  constructor(cardKey: string, container?: string) {
    super(
      !container || container === 'project'
        ? `Card '${cardKey}' does not exist in the project`
        : `Card '${cardKey}' is not part of template '${container}'`,
    );
    this.name = 'CardNotFoundError';
    this.details = { cardKey, ...(container && { container }) };
  }
}

/**
 * Thrown while loading cards when a card key is not unique across the project
 * and all of its templates.
 */
export class DuplicateCardKeyError extends DomainError {
  readonly code = 'conflict';
  constructor(public readonly cardKeys: string[]) {
    super(`Duplicate card keys found: ${cardKeys.join(', ')}`);
    this.name = 'DuplicateCardKeyError';
  }
}
/**
 * Stores the context of a macro error that originated from another macro
 */
export interface MacroDependency {
  macroName: string;
  parameters: string;
  output?: string;
}
/**
 * Thrown when a macro fails to execute.
 */
export class MacroError extends DomainError {
  readonly code = 'macro';
  public context: {
    cardKey: string;
    macroName: string;
    parameters: string;
    dependency?: MacroDependency;
  };

  constructor(
    message: string,
    cardKey: string,
    macroName: string,
    parameters: string,
    dependency?: MacroDependency,
  ) {
    super(message);
    this.name = 'MacroError';
    this.context = {
      cardKey,
      macroName,
      parameters,
      dependency,
    };
  }
}

/**
 * Thrown on a write to a container that belongs to an imported module.
 */
export class ReadOnlyContainerError extends DomainError {
  readonly code = 'read-only';
  constructor(public readonly container: string) {
    super(`Cannot modify imported module templates`);
    this.name = 'ReadOnlyContainerError';
    this.details = { container };
  }
}

/**
 * Thrown when a card would be placed under itself or one of its descendants.
 */
export class CycleError extends DomainError {
  readonly code = 'cycle';
  constructor(public readonly cardKey: string) {
    super(
      `Card '${cardKey}' cannot be placed under itself or one of its descendants`,
    );
    this.name = 'CycleError';
    this.details = { cardKey };
  }
}

/**
 * Thrown when a card would move between the project and a template.
 */
export class ContainerMismatchError extends DomainError {
  readonly code = 'container-mismatch';
  constructor(message: string) {
    super(message);
    this.name = 'ContainerMismatchError';
  }
}

/**
 * Thrown when the project's logic denies an operation on a card.
 */
export class PermissionDeniedError extends DomainError {
  readonly code = 'permission-denied';
  constructor(public readonly reasons: string[]) {
    super(reasons.join('; '));
    this.name = 'PermissionDeniedError';
    this.details = { reasons };
  }
}

/**
 * Thrown when a named resource is not in the project.
 */
export class ResourceNotFoundError extends DomainError {
  readonly code = 'not-found';
  constructor(public readonly resourceName: string) {
    super(`Resource '${resourceName}' does not exist in the project`);
    this.name = 'ResourceNotFoundError';
    this.details = { resourceName };
  }
}

/**
 * Thrown when a disposed workspace is used.
 */
export class WorkspaceDisposedError extends DomainError {
  readonly code = 'workspace-disposed';
  constructor(message: string = 'Workspace has been disposed') {
    super(message);
    this.name = 'WorkspaceDisposedError';
  }
}
