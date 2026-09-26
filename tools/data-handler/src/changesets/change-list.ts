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

import { COMMIT_TRAILERS } from '../utils/commit-context.js';
import { cardFileOf, type CardFile } from './card-paths.js';

import type {
  ChangedFile,
  CommitInfo,
  GitManager,
} from '../utils/git-manager.js';
import type { Link } from '../interfaces/resource-interfaces.js';

/** A metadata field whose value differs. */
export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

/** A commit that changed a card, and who made it. */
export interface CardCommit {
  hash: string;
  subject: string;
  date: string;
  author: { name: string; email: string };
  actor?: 'human' | 'agent';
  agent?: string;
}

/** How one card differs between two commits. */
export interface CardChange {
  key: string;
  /** Template name, for a template card. */
  template?: string;
  kind: 'created' | 'modified' | 'moved' | 'deleted';
  title: string;
  /** The card's folder: where it is now, or was when deleted. */
  path: string;
  /** The folder it was in, when it moved. */
  previousPath?: string;
  /** Parent card keys ('root' at the top), when it moved. */
  parent?: { before: string; after: string };
  /** Metadata fields that differ, other than links, rank and 'lastUpdated'. */
  fields: FieldChange[];
  contentChanged: boolean;
  /** Its position among its siblings changed. */
  reordered: boolean;
  links: { added: Link[]; removed: Link[] };
  attachments: { added: string[]; removed: string[] };
  /** Commits that changed the card, newest first. */
  commits: CardCommit[];
}

/** Everything that differs between two commits of a project. */
export interface ChangeList {
  base: string;
  head: string;
  cards: CardChange[];
  /** Changed project files that are not in a card: resources, configuration. */
  resources: ChangedFile[];
}

// Card-level bookkeeping, not changes a reviewer acts on
const IGNORED_FIELDS = new Set(['lastUpdated', 'links', 'rank']);

interface CardFiles {
  key: string;
  template?: string;
  before?: CardFile;
  after?: CardFile;
  contentChanged: boolean;
  attachmentsAdded: string[];
  attachmentsRemoved: string[];
  // Something other than the folder's location changed
  touched: boolean;
}

// Collects, per card key, where the card was and is and which files changed.
function groupByCard(files: ChangedFile[]): {
  cards: Map<string, CardFiles>;
  resources: ChangedFile[];
} {
  const cards = new Map<string, CardFiles>();
  const resources: ChangedFile[] = [];
  const entry = (file: CardFile) => {
    let card = cards.get(file.key);
    if (!card) {
      card = {
        key: file.key,
        template: file.template,
        contentChanged: false,
        attachmentsAdded: [],
        attachmentsRemoved: [],
        touched: false,
      };
      cards.set(file.key, card);
    }
    return card;
  };
  for (const file of files) {
    const after = file.status === 'D' ? undefined : cardFileOf(file.path);
    const before =
      file.status === 'A'
        ? undefined
        : cardFileOf(file.status === 'R' ? file.from! : file.path);
    if (!after && !before) {
      resources.push(file);
      continue;
    }
    const card = entry((after ?? before)!);
    if (before) card.before ??= before;
    if (after) card.after ??= after;
    const unchangedMove = file.status === 'R' && file.similarity === 100;
    if (!unchangedMove) {
      card.touched = true;
    }
    const role = (after ?? before)!.role;
    if (role === 'content' && !unchangedMove) {
      card.contentChanged = true;
    }
    if (role === 'attachment' && file.status !== 'R') {
      if (after) card.attachmentsAdded.push(after.attachment!);
      else card.attachmentsRemoved.push(before!.attachment!);
    }
  }
  return { cards, resources };
}

const parseJson = (
  text: string | null,
): Record<string, unknown> | undefined => {
  if (text === null) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

function linkDiff(before: unknown, after: unknown) {
  const asLinks = (value: unknown) =>
    Array.isArray(value) ? (value as Link[]) : [];
  const key = (link: Link) =>
    JSON.stringify([link.linkType, link.cardKey, link.linkDescription ?? '']);
  const beforeKeys = new Set(asLinks(before).map(key));
  const afterKeys = new Set(asLinks(after).map(key));
  return {
    added: asLinks(after).filter((link) => !beforeKeys.has(key(link))),
    removed: asLinks(before).filter((link) => !afterKeys.has(key(link))),
  };
}

function fieldDiff(
  before: Record<string, unknown> = {},
  after: Record<string, unknown> = {},
): FieldChange[] {
  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...fields]
    .filter((field) => !IGNORED_FIELDS.has(field))
    .filter(
      (field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]),
    )
    .map((field) => ({
      field,
      before: before[field] ?? null,
      after: after[field] ?? null,
    }));
}

function commitsByCard(commits: CommitInfo[]): Map<string, CardCommit[]> {
  const byCard = new Map<string, CardCommit[]>();
  for (const commit of commits) {
    const actor = commit.trailers[COMMIT_TRAILERS.actor];
    const cardCommit: CardCommit = {
      hash: commit.hash,
      subject: commit.subject,
      date: commit.date,
      author: commit.author,
      ...(actor === 'human' || actor === 'agent' ? { actor } : {}),
      ...(commit.trailers[COMMIT_TRAILERS.agent]
        ? { agent: commit.trailers[COMMIT_TRAILERS.agent] }
        : {}),
    };
    const keys = new Set(
      commit.files.flatMap((file) => cardFileOf(file)?.key ?? []),
    );
    for (const key of keys) {
      byCard.set(key, [...(byCard.get(key) ?? []), cardCommit]);
    }
  }
  return byCard;
}

/**
 * How the cards of a project differ between two commits.
 * @param git Git manager of the project (or of any worktree of its repo).
 * @param base Commit to compare from, normally the merge base.
 * @param head Commit to compare to.
 */
export async function computeChangeList(
  git: GitManager,
  base: string,
  head: string,
): Promise<ChangeList> {
  const { cards, resources } = groupByCard(await git.changedFiles(base, head));
  // A descendant of a moved card changes folder but not parent; unless
  // something else about it changed, it did not change.
  const relevant = [...cards.values()].filter(
    (card) =>
      card.touched ||
      !card.before ||
      !card.after ||
      card.before.parent !== card.after.parent,
  );
  const metadata = await git.readFiles(
    relevant.flatMap((card) => [
      {
        ref: base,
        path: `${(card.before ?? card.after)!.cardPath}/index.json`,
      },
      {
        ref: head,
        path: `${(card.after ?? card.before)!.cardPath}/index.json`,
      },
    ]),
  );
  const commits = commitsByCard(await git.log(base, head));

  const changes = relevant.flatMap((card, i): CardChange[] => {
    const before = parseJson(metadata[2 * i]);
    const after = parseJson(metadata[2 * i + 1]);
    if (!before && !after) {
      return [];
    }
    const beforeParent = card.before?.parent ?? 'root';
    const afterParent = card.after?.parent ?? 'root';
    const kind: CardChange['kind'] = !before
      ? 'created'
      : !after
        ? 'deleted'
        : beforeParent !== afterParent
          ? 'moved'
          : 'modified';
    const path =
      (after ? card.after : card.before)?.cardPath ?? card.before!.cardPath;
    const change: CardChange = {
      key: card.key,
      ...(card.template ? { template: card.template } : {}),
      kind,
      title: String((after ?? before)?.title ?? ''),
      path,
      fields: fieldDiff(before, after),
      contentChanged: card.contentChanged,
      reordered: !!before && !!after && before.rank !== after.rank,
      links: linkDiff(before?.links, after?.links),
      attachments: {
        added: card.attachmentsAdded,
        removed: card.attachmentsRemoved,
      },
      commits: commits.get(card.key) ?? [],
    };
    if (kind === 'moved') {
      change.previousPath = card.before!.cardPath;
      change.parent = { before: beforeParent, after: afterParent };
    }
    return [change];
  });
  changes.sort((a, b) => a.path.localeCompare(b.path));
  return { base, head, cards: changes, resources };
}
