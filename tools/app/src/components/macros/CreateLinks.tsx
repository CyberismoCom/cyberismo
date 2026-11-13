// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  DialogActions,
  DialogContent,
  DialogTitle,
  Input,
  Modal,
  ModalClose,
  ModalDialog,
  Tooltip,
  Typography,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import type { CalculationLink, CreateLinksOptions } from '@cyberismo/model';
import type { MacroContext } from '.';
import { useCard, useLinkCandidates, useLinkTypes } from '@/lib/api';
import { UserRole, useHasMinRole } from '@/lib/auth';
import type { ExpandedLinkType } from '@/lib/definitions';
import { useAppDispatch } from '@/lib/hooks';
import { addNotification } from '@/lib/slices/notifications';
import {
  eligibleCandidates,
  expandLinkTypes,
  searchCandidates,
} from '@/lib/utils';

const PAGE_SIZE = 10;

export type CreateLinksProps = CreateLinksOptions & MacroContext;

export default function CreateLinks({
  cardKey,
  direction = 'outbound',
  linkType,
  linkDescription,
  buttonLabel,
  query,
  macroKey,
  preview,
}: CreateLinksProps) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const canEdit = useHasMinRole(UserRole.Editor);
  const key = cardKey || macroKey;
  const { card, error: cardError, createLink } = useCard(key);
  const { linkTypes, error: linkTypesError } = useLinkTypes();
  const [open, setOpen] = useState(false);

  const expanded =
    linkTypes && card
      ? expandLinkTypes(linkTypes, card.cardType).find(
          (lt) => lt.name === linkType && lt.direction === direction,
        )
      : undefined;
  const loading = (!linkTypes && !linkTypesError) || (!card && !cardError);
  const reason = (() => {
    if (!canEdit) return t('permissions.editorRequired');
    // No reason until the card and link types load
    if (loading) return '';
    if (!linkTypes || !card) return t('createLinks.loadFailed');
    return t('createLinks.unavailable');
  })();
  const blocked = !canEdit || !expanded;
  // A definition change can block the button under an open dialog
  if (open && blocked) setOpen(false);

  return (
    <>
      {/* aria-disabled keeps the button focusable so the reason is reachable */}
      <Tooltip title={blocked ? reason : ''} describeChild>
        <Button
          aria-disabled={blocked || undefined}
          sx={(theme) =>
            blocked
              ? {
                  ...theme.variants.solidDisabled.primary,
                  '&:hover': theme.variants.solidDisabled.primary,
                  cursor: 'not-allowed',
                }
              : {}
          }
          onClick={() => {
            if (blocked) return;
            if (preview) {
              dispatch(
                addNotification({
                  message: t('createLinks.preview'),
                  type: 'success',
                }),
              );
              return;
            }
            setOpen(true);
          }}
        >
          {buttonLabel || t('createLinks.buttonLabel')}
        </Button>
      </Tooltip>
      {open && expanded && card && (
        <CreateLinksDialog
          cardKey={key}
          links={card.links}
          linkType={expanded}
          linkDescription={linkDescription}
          query={query}
          createLink={createLink}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

type CreateLinksDialogProps = {
  cardKey: string;
  links: CalculationLink[];
  linkType: ExpandedLinkType;
  linkDescription?: string;
  query: string;
  createLink: ReturnType<typeof useCard>['createLink'];
  onClose: () => void;
};

// Mounted only while open, so every opening starts fresh
function CreateLinksDialog({
  cardKey,
  links,
  linkType,
  linkDescription,
  query,
  createLink,
  onClose,
}: CreateLinksDialogProps) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const { candidates, error, isValidating } = useLinkCandidates(query);

  // Rows cached from an earlier opening are hidden while the refetch runs
  const rows = isValidating || error ? [] : (candidates ?? []);
  const eligible = eligibleCandidates(cardKey, rows, linkType, links);
  const visible = searchCandidates(eligible, search);
  // Create acts on every eligible tick, including ones the search hides
  const picks = eligible.filter((candidate) => selected.has(candidate.key));
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  // Keep the page within range as the list shrinks
  const current = Math.min(page, pages - 1);
  const shown = visible.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  const notify = (message: string, type: 'success' | 'error') =>
    dispatch(addNotification({ message, type }));

  const close = () => {
    if (!creating) onClose();
  };

  const toggle = (candidate: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(candidate)) next.add(candidate);
      return next;
    });

  // One at a time: every call rewrites the same card
  const create = async () => {
    setCreating(true);
    const failed = new Set<string>();
    let firstError: string | undefined;
    for (const { key } of picks) {
      try {
        await createLink(
          key,
          linkType.name,
          linkType.enableLinkDescription
            ? (descriptions[key] ?? linkDescription)?.trim() || undefined
            : undefined,
          linkType.direction,
        );
      } catch (e) {
        failed.add(key);
        firstError ??= e instanceof Error ? e.message : undefined;
      }
    }
    setCreating(false);
    const succeeded = picks.length - failed.size;
    if (succeeded > 0) {
      notify(t('createLink.success', { count: succeeded }), 'success');
    }
    if (failed.size > 0) {
      const summary = t('createLink.partialFailure', { count: failed.size });
      // The first reason only; the rest are often the same
      notify(firstError ? `${summary}: ${firstError}` : summary, 'error');
      setSelected(failed);
    } else {
      onClose();
    }
  };

  return (
    <Modal open onClose={close}>
      <ModalDialog sx={{ width: { xs: '95vw', sm: '60%' } }}>
        <ModalClose disabled={creating} />
        <DialogTitle>{t('createLinks.title')}</DialogTitle>
        <Input
          autoFocus
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder={t('createLinks.search')}
          slotProps={{ input: { 'aria-label': t('createLinks.search') } }}
        />
        <DialogContent sx={{ overflowX: 'hidden' }}>
          {error && (
            <Typography color="danger" role="alert">
              {error instanceof Error ? error.message : t('unknownError')}
            </Typography>
          )}
          {/* Mounted up front so screen readers announce changes */}
          <Box role="status">
            {!error && !isValidating && visible.length === 0 && (
              <Typography>{t('createLinks.noResults')}</Typography>
            )}
          </Box>
          {shown.map((candidate) => (
            <Box
              key={candidate.key}
              sx={{ display: 'flex', gap: 1, alignItems: 'center', py: 0.5 }}
            >
              <Checkbox
                checked={selected.has(candidate.key)}
                onChange={() => toggle(candidate.key)}
                label={`${candidate.title} (${candidate.key})`}
                sx={{ flex: 1 }}
              />
              {linkType.enableLinkDescription && (
                <Input
                  size="sm"
                  placeholder={t('createLinks.description')}
                  slotProps={{
                    input: { 'aria-label': t('createLinks.description') },
                  }}
                  value={descriptions[candidate.key] ?? linkDescription ?? ''}
                  onChange={(e) =>
                    setDescriptions((prev) => ({
                      ...prev,
                      [candidate.key]: e.target.value,
                    }))
                  }
                />
              )}
            </Box>
          ))}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Button
              size="sm"
              variant="plain"
              aria-label={t('createLinks.previousPage')}
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              &lt;
            </Button>
            <Typography level="body-sm">
              {t('createLinks.page', { page: current + 1, pages })}
            </Typography>
            <Button
              size="sm"
              variant="plain"
              aria-label={t('createLinks.nextPage')}
              disabled={current + 1 >= pages}
              onClick={() => setPage(current + 1)}
            >
              &gt;
            </Button>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="plain" disabled={creating} onClick={close}>
              {t('cancel')}
            </Button>
            <Button
              loading={creating}
              disabled={picks.length === 0}
              onClick={create}
            >
              {t('createLinks.create')}
            </Button>
          </Box>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}
