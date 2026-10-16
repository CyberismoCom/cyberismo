// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Which projects, or the whole instance, are read-only.
 *
 * Polled on a timer so no request waits for it, and permissive on every
 * uncertain path: a freeze arriving late beats an outage. Unset
 * CYBERISMO_OVERLAY_URL means no policy, which is the standalone default.
 */

import { z } from 'zod';
import {
  ProjectNotFoundError,
  type ProjectDirectory,
} from '@cyberismo/data-handler';

const POLL_INTERVAL_MS = 10_000;
const FETCH_TIMEOUT_MS = 2_000;

const policySchema = z
  .object({
    readOnly: z.boolean().catch(false),
    projects: z
      .record(z.string(), z.object({ readOnly: z.boolean().catch(false) }))
      .catch({}),
  })
  .catch(() => EMPTY);

export type Policy = z.infer<typeof policySchema>;

const EMPTY: Policy = { readOnly: false, projects: {} };

let current: Policy = EMPTY;

export function getPolicy(): Policy {
  return current;
}

export function setPolicy(policy: Policy): void {
  current = policy;
}

export function isProjectReadOnly(prefix: string): boolean {
  return current.readOnly || current.projects[prefix]?.readOnly === true;
}

/** `/api/projects/<prefix>/…` is the only request shape naming a project. */
export function isReadOnly(path: string): boolean {
  if (current.readOnly) return true;
  const match = /^\/api\/projects\/([^/?#]+)/.exec(path);
  if (!match) return false;
  let prefix: string;
  try {
    prefix = decodeURIComponent(match[1]);
  } catch {
    prefix = match[1];
  }
  return isProjectReadOnly(prefix);
}

/**
 * Temporary: the app is the source of truth for which projects exist, so it
 * tells overlay. That inverts once projects are created in overlay's admin
 * views, after which overlay reports them and this goes away.
 */
async function reportProjects(
  base: string,
  token: string | undefined,
  projects: { prefix: string }[],
): Promise<void> {
  const response = await fetch(`${base.replace(/\/$/, '')}/projects`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Overlay-Token': token } : {}),
    },
    body: JSON.stringify({ projects }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`responded ${response.status}`);
  }
}

export function startPolicyPolling(
  projects: () => Promise<{ prefix: string }[]> = async () => [],
): void {
  const base = process.env.CYBERISMO_OVERLAY_URL;
  if (!base) return;
  const token = process.env.CYBERISMO_OVERLAY_TOKEN;
  const url = `${base.replace(/\/$/, '')}/tenant`;

  let lastFailure: string | undefined;

  const poll = async () => {
    try {
      const response = await fetch(url, {
        headers: token ? { 'X-Overlay-Token': token } : {},
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`responded ${response.status}`);
      }
      setPolicy(policySchema.parse(await response.json()));
      if (lastFailure) {
        console.error(`overlay: ${url} is reachable again`);
        lastFailure = undefined;
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (reason !== lastFailure) {
        lastFailure = reason;
        console.error(`overlay: ${url} ${reason}, keeping the previous policy`);
      }
    }
  };

  // Reported every tick from a fresh list, so a project created after start-up
  // is registered within one interval.
  let lastReportFailure: string | undefined;
  const report = async () => {
    const current = await projects();
    if (current.length === 0) return;
    try {
      await reportProjects(base, token, current);
      lastReportFailure = undefined;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (reason !== lastReportFailure) {
        lastReportFailure = reason;
        console.error(`overlay: could not report projects, ${reason}`);
      }
    }
  };

  // setInterval does not wait for the previous run, so skip a tick rather than
  // letting two overlap.
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await poll();
      await report();
    } finally {
      running = false;
    }
  };

  void tick();
  setInterval(() => void tick(), POLL_INTERVAL_MS).unref();
}

/**
 * Hide read-only projects from MCP.
 *
 * MCP takes the project as an argument rather than in the path, so the role cap
 * cannot see which one a call touches. Making a frozen project unresolvable
 * fails closed, at the cost of hiding it from reads and from administrators too.
 */
export function writableProjects(
  directory: ProjectDirectory,
): ProjectDirectory {
  return {
    open: async (prefix, actor, identity) => {
      if (isProjectReadOnly(prefix)) {
        throw new ProjectNotFoundError(prefix);
      }
      return directory.open(prefix, actor, identity);
    },
    list: async () =>
      (await directory.list()).filter((p) => !isProjectReadOnly(p.prefix)),
    create: (params, actor, identity) =>
      directory.create(params, actor, identity),
    clone: (url) => directory.clone(url),
    rename: async (prefix, newPrefix, actor, identity, options) => {
      if (isProjectReadOnly(prefix)) {
        throw new ProjectNotFoundError(prefix);
      }
      return directory.rename(prefix, newPrefix, actor, identity, options);
    },
    replace: (prefix) => directory.replace(prefix),
  };
}
