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

import { Fragment, useState } from 'react';
import UndoIcon from '@mui/icons-material/Undo';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  IconButton,
  Stack,
  Table,
  Tooltip,
  Typography,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import {
  useAppDispatch,
  useAppRouter,
  useAppSelector,
  useDocumentTitle,
} from '@/lib/hooks';
import { selectLastPathByPrefix } from '@/lib/slices/project';
import { addNotification } from '@/lib/slices/notifications';
import { UserRole, useHasMinRole } from '@/lib/auth';
import { ApiCallError } from '@/lib/swr';
import {
  discardChangeSet,
  markCardReviewed,
  mergeChangeSet,
  revertCard,
  updateChangeSet,
  useActiveChangeSet,
  useChangeSetChanges,
  type ChangeSetConflict,
  type ConflictResolution,
} from '@/lib/api/changesets';
import type { CardChange } from '@cyberismo/data-handler/changesets/change-list';
import { CardChangeDiff } from '@/components/changesets/CardChangeDiff';
import { ConflictsModal } from '@/components/changesets/ConflictsModal';
import { GenericConfirmModal } from '@/components/modals/GenericConfirmModal';

const kindColors = {
  created: 'success',
  modified: 'primary',
  moved: 'neutral',
  deleted: 'danger',
} as const;

// What changed about a card, in a few words
function details(card: CardChange, t: (key: string) => string): string {
  return [
    ...(card.kind === 'modified' || card.kind === 'moved'
      ? card.fields.map((field) => field.field)
      : []),
    ...(card.contentChanged &&
    card.kind !== 'created' &&
    card.kind !== 'deleted'
      ? [t('changeSet.changedItems.content')]
      : []),
    ...(card.reordered ? [t('changeSet.changedItems.rank')] : []),
    ...(card.links.added.length + card.links.removed.length
      ? [t('changeSet.changedItems.links')]
      : []),
    ...(card.attachments.added.length + card.attachments.removed.length
      ? [t('changeSet.changedItems.attachments')]
      : []),
  ].join(', ');
}

/**
 * Review of the user's active changeSet: what it changes, card by card, with
 * reviewed marks, diffs and reverts; bring in the project's latest changes,
 * then merge, or discard.
 */
export default function ChangeSetReviewPage() {
  const { t } = useTranslation();
  const { projectPrefix } = useParams();
  const prefix = projectPrefix!;
  const dispatch = useAppDispatch();
  const router = useAppRouter();
  const canEdit = useHasMinRole(UserRole.Editor);
  const { id, changeSet } = useActiveChangeSet();
  const { changes, isLoading, error } = useChangeSetChanges(id);
  const lastPath = useAppSelector(selectLastPathByPrefix)[prefix];
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ChangeSetConflict[] | null>(null);
  const [confirm, setConfirm] = useState<'merge' | 'discard' | null>(null);
  useDocumentTitle(
    changeSet
      ? `${changeSet.title} - ${t('changeSet.reviewTitle')}`
      : t('changeSet.reviewTitle'),
  );

  const notify = (
    message: string,
    type: 'success' | 'error' | 'info' | 'warning',
  ) => dispatch(addNotification({ message, type }));
  const failure = (error: unknown) =>
    notify(error instanceof Error ? error.message : String(error), 'error');

  // Runs an action, one at a time, reporting failures
  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    try {
      await action();
    } catch (error) {
      failure(error);
    } finally {
      setBusy(null);
    }
  };

  if (!id) {
    return (
      <Container sx={{ py: 4 }}>
        <Typography level="h3">{t('changeSet.reviewTitle')}</Typography>
        <Typography sx={{ mt: 1 }}>{t('changeSet.noneActive')}</Typography>
        <Link to={`/projects/${prefix}/cards`}>
          {t('changeSet.backToCards')}
        </Link>
      </Container>
    );
  }

  const cards = changes?.cards ?? [];
  const unreviewed = cards.filter((card) => !card.reviewed).length;

  // Once the changeSet is closed: back to the card viewed last, unless it is
  // gone with the changeSet; else the card list
  const returnTo = (gone: CardChange['kind']) => {
    const key = lastPath?.match(/^\/cards\/([^/]+)$/)?.[1];
    const exists = !cards.some(
      (card) => card.kind === gone && card.key === key,
    );
    return key && exists
      ? `/projects/${prefix}${lastPath}`
      : `/projects/${prefix}/cards`;
  };

  const update = (resolutions?: Record<string, ConflictResolution>) =>
    run('update', async () => {
      const result = await updateChangeSet(prefix, id, resolutions);
      if (result.conflicts.length > 0) {
        setConflicts(result.conflicts);
        return;
      }
      setConflicts(null);
      notify(
        t(result.updated ? 'changeSet.updated' : 'changeSet.upToDate'),
        'success',
      );
      if (result.removedLinks.length > 0) {
        notify(
          t('changeSet.linksRemoved', {
            count: result.removedLinks.length,
            links: result.removedLinks
              .map((link) => `${link.cardKey} → ${link.target}`)
              .join(', '),
          }),
          'warning',
        );
      }
    });

  const merge = () =>
    run('merge', async () => {
      setConfirm(null);
      try {
        await mergeChangeSet(prefix, id);
      } catch (error) {
        if (error instanceof ApiCallError && error.response.status === 409) {
          notify(t('changeSet.behind'), 'warning');
          return;
        }
        throw error;
      }
      notify(
        t('changeSet.merged', { title: changeSet?.title ?? '' }),
        'success',
      );
      router.push(returnTo('deleted'));
    });

  const discard = () =>
    run('discard', async () => {
      setConfirm(null);
      await discardChangeSet(prefix, id);
      notify(
        t('changeSet.discarded', { title: changeSet?.title ?? '' }),
        'info',
      );
      router.push(returnTo('created'));
    });

  return (
    <Container
      sx={{ py: 3, height: '100%', overflow: 'auto' }}
      data-cy="changeSetReview"
    >
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        justifyContent="space-between"
        alignItems={{ md: 'center' }}
      >
        <Box>
          <Typography level="body-sm">{t('changeSet.reviewTitle')}</Typography>
          <Typography level="h3">{changeSet?.title}</Typography>
          <Typography level="body-sm">
            {t('changeSet.summary', {
              owner: changeSet?.owner?.name ?? '—',
              count: cards.length,
              unreviewed,
            })}
          </Typography>
        </Box>
        {canEdit && (
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              loading={busy === 'update'}
              disabled={busy !== null}
              onClick={() => void update()}
            >
              {t('changeSet.update')}
            </Button>
            <Button
              loading={busy === 'merge'}
              disabled={busy !== null || cards.length === 0}
              onClick={() => setConfirm('merge')}
              data-cy="mergeChangeSet"
            >
              {t('changeSet.merge')}
            </Button>
            <Button
              variant="plain"
              color="danger"
              loading={busy === 'discard'}
              disabled={busy !== null}
              onClick={() => setConfirm('discard')}
            >
              {t('changeSet.discard')}
            </Button>
          </Stack>
        )}
      </Stack>

      <Box sx={{ mt: 3 }}>
        {isLoading && <CircularProgress size="sm" />}
        {error && (
          <Typography color="danger">
            {error instanceof Error ? error.message : String(error)}
          </Typography>
        )}
        {!isLoading && !error && cards.length === 0 && (
          <Typography>{t('changeSet.noChanges')}</Typography>
        )}
        {cards.length > 0 && (
          <Table
            hoverRow
            size="sm"
            sx={{ '& td': { verticalAlign: 'middle' } }}
          >
            <thead>
              <tr>
                <th style={{ width: 90 }}>{t('changeSet.reviewed')}</th>
                <th style={{ width: 100 }}>{t('changeSet.change')}</th>
                <th>{t('changeSet.card')}</th>
                <th>{t('changeSet.changed')}</th>
                <th style={{ width: 160 }}>{t('changeSet.by')}</th>
                <th style={{ width: 50 }} />
              </tr>
            </thead>
            <tbody>
              {cards.map((card) => {
                const actors = [
                  ...new Set(
                    card.commits.map((commit) =>
                      commit.actor === 'agent'
                        ? (commit.agent ?? t('changeSet.agent'))
                        : commit.author.name,
                    ),
                  ),
                ];
                const agentMade = card.commits.some(
                  (commit) => commit.actor === 'agent',
                );
                return (
                  <Fragment key={card.key}>
                    <tr
                      onClick={() =>
                        setOpen(open === card.key ? null : card.key)
                      }
                      style={{ cursor: 'pointer' }}
                      data-cy="changedCard"
                    >
                      <td onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={card.reviewed}
                          disabled={!canEdit}
                          slotProps={{
                            input: { 'aria-label': t('changeSet.reviewed') },
                          }}
                          onChange={(event) =>
                            void run('review', () =>
                              markCardReviewed(
                                prefix,
                                id,
                                card.key,
                                event.target.checked,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          variant="soft"
                          color={kindColors[card.kind]}
                        >
                          {t(`changeSet.kind.${card.kind}`)}
                        </Chip>
                      </td>
                      <td>
                        {card.kind === 'deleted' ? (
                          <Typography level="body-sm">{card.title}</Typography>
                        ) : (
                          <Link
                            to={`/projects/${prefix}/cards/${card.key}`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {card.title || card.key}
                          </Link>
                        )}
                        <Typography level="body-xs">{card.key}</Typography>
                      </td>
                      <td>
                        <Typography level="body-sm">
                          {details(card, t)}
                        </Typography>
                      </td>
                      <td>
                        <Chip
                          size="sm"
                          variant="outlined"
                          color={agentMade ? 'warning' : 'neutral'}
                        >
                          {actors.join(', ') || '—'}
                        </Chip>
                      </td>
                      <td onClick={(event) => event.stopPropagation()}>
                        {canEdit && (
                          <Tooltip title={t('changeSet.revert')}>
                            <IconButton
                              size="sm"
                              disabled={busy !== null}
                              aria-label={t('changeSet.revert')}
                              onClick={() =>
                                void run('revert', () =>
                                  revertCard(prefix, id, card.key),
                                )
                              }
                            >
                              <UndoIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                      </td>
                    </tr>
                    {open === card.key && (
                      <tr>
                        <td colSpan={6}>
                          <Box sx={{ p: 1 }}>
                            <CardChangeDiff
                              changeSetId={id}
                              cardKey={card.key}
                            />
                          </Box>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </Table>
        )}
        {changes && changes.resources.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Typography level="title-md">{t('changeSet.resources')}</Typography>
            {changes.resources.map((file) => (
              <Typography level="body-sm" key={file.path}>
                {file.status} {file.path}
              </Typography>
            ))}
          </Box>
        )}
      </Box>

      {conflicts && (
        <ConflictsModal
          conflicts={conflicts}
          busy={busy === 'update'}
          onResolve={(resolutions) => void update(resolutions)}
          onClose={() => setConflicts(null)}
        />
      )}
      <GenericConfirmModal
        open={confirm === 'merge'}
        onClose={() => setConfirm(null)}
        title={t('changeSet.mergeTitle')}
        content={
          unreviewed > 0
            ? t('changeSet.mergeUnreviewed', { count: unreviewed })
            : t('changeSet.mergeConfirm')
        }
        confirmText={t('changeSet.merge')}
        confirmColor="primary"
        onConfirm={() => void merge()}
      />
      <GenericConfirmModal
        open={confirm === 'discard'}
        onClose={() => setConfirm(null)}
        title={t('changeSet.discardTitle')}
        content={t('changeSet.discardConfirm')}
        confirmText={t('changeSet.discard')}
        onConfirm={() => void discard()}
      />
    </Container>
  );
}
