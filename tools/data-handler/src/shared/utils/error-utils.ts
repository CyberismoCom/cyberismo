// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Returns error message string from an Error object.
 * @param error Error object
 * @returns Error message.
 */
export function errorFunction(error: unknown): string {
  if (error instanceof Error) {
    const err: Error = error;
    return `${err.message}`;
  } else if (typeof error === 'string') {
    return `${error}`;
  } else {
    return `errorFunction called without an error object. Actual object is ${JSON.stringify(error)}`;
  }
}

/**
 * Type guard to check if an error object has a code property.
 * @param error The error object to check
 * @returns true if the error has a code property
 */
export function hasCode(error: unknown): error is Error & { code: string } {
  return (
    error instanceof Error &&
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  );
}
