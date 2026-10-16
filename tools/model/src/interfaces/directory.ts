// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

/** A project of a directory, as its list gives it. */
export interface ProjectSummary {
  prefix: string;
  name: string;
  category?: string;
  description?: string;
}

/** What a new project is created with. */
export interface CreateProjectParams {
  name: string;
  prefix: string;
  category?: string;
  description?: string;
  skipDefaultHub?: boolean;
}

/**
 * A created project. `failures` are steps after its files were written that
 * did not happen (the default hub not added); `warnings` did not stop
 * anything (a hub not fetched).
 */
export interface CreateProjectResult {
  path: string;
  prefix: string;
  failures: string[];
  warnings: string[];
}

/** The projects a clone added, and the prefixes it skipped as present. */
export interface CloneProjectResult {
  projects: { prefix: string; name: string }[];
  skippedDuplicates?: string[];
}
