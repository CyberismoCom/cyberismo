/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Which projects, or the whole instance, are read-only.
 *
 * Polled on a timer so no request waits for it, and permissive on every
 * uncertain path: a freeze arriving late beats an outage. Unset
 * CYBERISMO_OVERLAY_URL means no policy, which is the standalone default.
 */

import { z } from 'zod';

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
  return current.projects[prefix]?.readOnly === true;
}

/**
 * Temporary: the app is the source of truth for which projects exist, so it
 * tells overlay. That inverts once projects are created in overlay's admin
 * views, after which overlay reports them and this goes away.
 */
async function reportProjects(
  base: string,
  token: string | undefined,
  projects: { prefix: string; name: string }[],
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
  projects: { prefix: string; name: string }[] = [],
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

  let registered = projects.length === 0;
  let lastReportFailure: string | undefined;
  const report = async () => {
    if (registered) return;
    try {
      await reportProjects(base, token, projects);
      registered = true;
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
