// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

export interface ProjectErrors {
  prefix: string;
  errors: string[];
}

/** Formats errors as one block per project, capping each at `limit` lines. */
export function formatProjectErrors(
  groups: ProjectErrors[],
  limit: number = 10,
): string {
  const heading = `${groups.length} ${groups.length === 1 ? 'project has' : 'projects have'} errors:`;
  const blocks = groups.map(({ prefix, errors }) => {
    const lines = errors.slice(0, limit).map((e) => `  ${e}`);
    if (errors.length > limit) {
      lines.push(`  … ${errors.length - limit} more`);
    }
    return `${prefix} (${errors.length}):\n${lines.join('\n')}`;
  });
  return [heading, ...blocks].join('\n\n');
}
