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

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, IconButton, Stack, Typography } from '@mui/joy';
import Edit from '@mui/icons-material/Edit';
import type { ExpandedLinkType } from '../../lib/definitions';
import type { CardResponse, Connector } from '../../lib/api/types';
import type {
  CalculationLink,
  QueryResult,
} from '@cyberismo/data-handler/types/queries';
import { getConfig, useModals } from '../../lib/utils';
import { useCard } from '../../lib/api';
import { GenericConfirmModal } from '../modals';
import { EditMode } from './EditMode';
import { LinkRow } from './LinkRow';
import type { LinkFormSubmitData, LinkFormState } from './EditMode';

export type { LinkFormState, LinkFormSubmitData };
export { LinkForm } from './EditMode';

type LinkedCardSectionProps = {
  card: CardResponse;
  cards: QueryResult<'tree'>[];
  linkTypes: ExpandedLinkType[];
  connectors?: Connector[];
  preview?: boolean;
  linkFormState: LinkFormState;
  onLinkFormChange?: (state: LinkFormState) => void;
  onLinkFormSubmit?: (data: LinkFormSubmitData) => boolean | Promise<boolean>;
  onDeleteLink?: (data: CalculationLink) => void | Promise<void>;
};

export default function LinkedCardsSection({
  card,
  cards,
  linkTypes,
  connectors,
  preview,
  linkFormState,
  onLinkFormChange,
  onLinkFormSubmit,
  onDeleteLink,
}: LinkedCardSectionProps) {
  const { t } = useTranslation();
  const { isUpdating } = useCard(card.key);
  const [editing, setEditing] = useState(false);
  const [deleteLinkData, setDeleteLinkData] = useState<CalculationLink | null>(
    null,
  );

  const { modalOpen, openModal, closeModal } = useModals({
    deleteLink: false,
  });

  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (linkFormState === 'add' || linkFormState === 'add-from-toolbar') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditing(true);
    } else if (linkFormState === 'hidden') {
      setEditing(false);
    }
    if (linkFormState === 'add-from-toolbar') {
      sectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }, [linkFormState]);

  if (card.links.length === 0 && linkFormState === 'hidden' && !editing) {
    return null;
  }

  return (
    <>
      <Box
        ref={sectionRef}
        border="1px solid"
        borderColor={
          editing ? 'primary.outlinedBorder' : 'neutral.outlinedBorder'
        }
        borderRadius={6}
        padding={2}
      >
        <Stack direction="row" alignItems="center" marginBottom={1}>
          <Typography level="h2" fontSize="lg" flexGrow={1}>
            {t('linkedCards')}
          </Typography>
          {!preview &&
            !getConfig().staticMode &&
            (editing ? (
              <Button
                variant="plain"
                color="primary"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  onLinkFormChange?.('hidden');
                }}
              >
                {t('close')}
              </Button>
            ) : (
              <IconButton
                data-cy="linkedCardsEditButton"
                variant="soft"
                color="primary"
                size="sm"
                onClick={() => {
                  setEditing(true);
                  onLinkFormChange?.('add');
                }}
              >
                <Edit />
              </IconButton>
            ))}
        </Stack>

        {editing ? (
          <EditMode
            card={card}
            cards={cards}
            linkTypes={linkTypes}
            connectors={connectors}
            onAddSubmit={async (data) =>
              (await onLinkFormSubmit?.(data)) ?? false
            }
            onEditSubmit={async (link, data) =>
              (await onLinkFormSubmit?.({
                ...data,
                previousLinkType: link.linkType,
                previousCardKey: link.connector
                  ? `${link.connector}:${link.key}`
                  : link.key,
                previousLinkDescription: link.linkDescription ?? '',
                previousDirection: link.direction,
              })) ?? false
            }
            onDeleteLink={(link) => {
              setDeleteLinkData(link);
              openModal('deleteLink')();
            }}
            isLoading={isUpdating()}
            isAddUpdating={isUpdating('createLink')}
            isEditUpdating={isUpdating('update')}
          />
        ) : (
          <>
            {card.links.map((link, index) => (
              <LinkRow key={link.key + index} link={link} />
            ))}
          </>
        )}
      </Box>

      <GenericConfirmModal
        open={modalOpen.deleteLink}
        onClose={closeModal('deleteLink')}
        onConfirm={async () => {
          if (deleteLinkData) await onDeleteLink?.(deleteLinkData);
          closeModal('deleteLink')();
        }}
        title={t('deleteLink')}
        content={t('deleteLinkConfirm')}
        confirmText={t('delete')}
      />
    </>
  );
}
