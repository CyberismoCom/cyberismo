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

import useSWR, { mutate } from 'swr';
import { useParams } from 'react-router';
import type {
  CardDiff,
  ChangeSetChanges,
  ChangeSetConflict,
  ChangeSetInfo,
  ConflictResolution,
} from '@cyberismo/data-handler/changesets/change-set-manager';
import { callApi, changeSetApiPaths } from '../swr';
import { store } from '../store';
import { getConfig } from '../utils';
import { useAppSelector } from '../hooks/redux';
import { selectActiveChangeSet, setActiveChangeSet } from '../slices/changeSet';

export type {
  CardDiff,
  ChangeSetChanges,
  ChangeSetConflict,
  ChangeSetInfo,
  ConflictResolution,
};

/** A changeSet as listed: whether it is the current user's active one. */
export type ChangeSetListItem = ChangeSetInfo & { active: boolean };

const projectKey = (prefix: string) =>
  `/api/projects/${encodeURIComponent(prefix)}`;

/**
 * Whether cached data at a key should be fetched again for the project: data
 * from the project itself, from the active changeSet and about changeSets,
 * but never from another changeSet (once merged or discarded, it answers no
 * more). Other changeSets' data stays cached, so going back to one shows it
 * at once while it is fetched again.
 */
export function isRefetchable(
  key: unknown,
  prefix: string,
  active: string | null,
): boolean {
  if (typeof key !== 'string' || !key.startsWith(projectKey(prefix))) {
    return false;
  }
  const inChangeSet = `${projectKey(prefix)}/changesets/`;
  if (!key.startsWith(inChangeSet)) {
    return true;
  }
  // '.../changesets/<id>/...' belongs to that changeSet
  const [id, ...rest] = key.slice(inChangeSet.length).split('/');
  return rest.length === 0 || decodeURIComponent(id) === active;
}

// Refetches what the app fetched about the project
const revalidateProject = (prefix: string) => {
  const active = store.getState().changeSet.activeByPrefix[prefix] ?? null;
  return mutate((key) => isRefetchable(key, prefix, active));
};

const setActive = (prefix: string, id: string | null) => {
  store.dispatch(setActiveChangeSet({ prefix, id }));
};

/**
 * Asks the server for the user's active changeSet in a project and mirrors
 * it in the store. Static exports have none.
 */
export async function loadActiveChangeSet(
  prefix: string,
): Promise<string | null> {
  if (getConfig().staticMode) {
    setActive(prefix, null);
    return null;
  }
  try {
    const { changeSet } = await callApi<{ changeSet: ChangeSetInfo | null }>(
      changeSetApiPaths(prefix).active(),
      'GET',
    );
    setActive(prefix, changeSet?.id ?? null);
    return changeSet?.id ?? null;
  } catch {
    // Not in a git repository, or no access: work in the project itself
    setActive(prefix, null);
    return null;
  }
}

/** The user's active changeSet in the current project, if any. */
export function useActiveChangeSet() {
  const { projectPrefix } = useParams();
  const id = useAppSelector(selectActiveChangeSet(projectPrefix));
  const { data, ...rest } = useSWR<ChangeSetInfo>(
    id ? changeSetApiPaths(projectPrefix).changeSet(id) : null,
  );
  return { ...rest, id, changeSet: data };
}

/** The project's changeSets; fetched only when enabled. */
export function useChangeSets(enabled = true) {
  const { projectPrefix } = useParams();
  const { data, ...rest } = useSWR<ChangeSetListItem[]>(
    enabled && !getConfig().staticMode
      ? changeSetApiPaths(projectPrefix).list()
      : null,
  );
  return { ...rest, changeSets: data ?? [] };
}

/** What a changeSet changes, card by card. */
export function useChangeSetChanges(id: string | null) {
  const { projectPrefix } = useParams();
  const { data, ...rest } = useSWR<ChangeSetChanges>(
    id ? changeSetApiPaths(projectPrefix).changes(id) : null,
  );
  return { ...rest, changes: data };
}

/** One card before and after a changeSet's changes. */
export function useCardDiff(id: string | null, cardKey: string | null) {
  const { projectPrefix } = useParams();
  const { data, ...rest } = useSWR<CardDiff>(
    id && cardKey
      ? changeSetApiPaths(projectPrefix).cardDiff(id, cardKey)
      : null,
  );
  return { ...rest, diff: data };
}

/** Starts a changeSet and works in it. */
export async function startChangeSet(prefix: string, title: string) {
  const info = await callApi<ChangeSetListItem>(
    changeSetApiPaths(prefix).list(),
    'POST',
    { title },
  );
  setActive(prefix, info.id);
  await revalidateProject(prefix);
  return info;
}

/** Works in another changeSet, or with null in the project itself. */
export async function switchChangeSet(prefix: string, id: string | null) {
  await callApi(changeSetApiPaths(prefix).active(), 'PUT', { id });
  setActive(prefix, id);
  await revalidateProject(prefix);
}

/** Marks a card reviewed as it stands, or clears the mark. */
export async function markCardReviewed(
  prefix: string,
  id: string,
  cardKey: string,
  reviewed: boolean,
) {
  await callApi(changeSetApiPaths(prefix).reviewed(id, cardKey), 'PUT', {
    reviewed,
  });
  await mutate(changeSetApiPaths(prefix).changes(id));
}

/** Undoes a changeSet's changes to one card. */
export async function revertCard(prefix: string, id: string, cardKey: string) {
  await callApi(changeSetApiPaths(prefix).revert(id, cardKey), 'POST');
  await revalidateProject(prefix);
}

/**
 * Brings the project's latest changes into a changeSet. Conflicts it could
 * not settle come back, and nothing changes, until resolutions settle them.
 */
export async function updateChangeSet(
  prefix: string,
  id: string,
  resolutions?: Record<string, ConflictResolution>,
) {
  const result = await callApi<{
    updated: boolean;
    conflicts: ChangeSetConflict[];
  }>(changeSetApiPaths(prefix).update(id), 'POST', { resolutions });
  if (result.updated) {
    await revalidateProject(prefix);
  }
  return result;
}

/** Merges a changeSet into the project; the user is back in the project. */
export async function mergeChangeSet(prefix: string, id: string) {
  const info = await callApi<ChangeSetInfo>(
    changeSetApiPaths(prefix).merge(id),
    'POST',
  );
  setActive(prefix, null);
  await revalidateProject(prefix);
  return info;
}

/** Discards a changeSet; the user is back in the project. */
export async function discardChangeSet(prefix: string, id: string) {
  await callApi(changeSetApiPaths(prefix).changeSet(id), 'DELETE');
  setActive(prefix, null);
  await revalidateProject(prefix);
}
