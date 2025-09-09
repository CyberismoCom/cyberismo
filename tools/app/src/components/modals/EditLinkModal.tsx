/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { useRef } from 'react';
import {
  Modal,
  ModalDialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  ModalClose,
  Divider,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import type { ExpandedLinkType } from '@/lib/definitions';
import { LinkForm } from '../ContentArea';
import type {
  QueryResult,
  LinkDirection,
} from '@cyberismo/data-handler/types/queries';
import { useCard } from '@/lib/api';

interface LinkFormData {
  linkType: number;
  cardKey: string;
  linkDescription: string;
  linkTypeName: string;
  direction: LinkDirection;
}

interface EditLinkModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    linkType: string;
    cardKey: string;
    linkDescription: string;
    direction: LinkDirection;
    previousLinkType?: string;
    previousCardKey?: string;
    previousLinkDescription?: string;
    previousDirection?: LinkDirection;
  }) => Promise<boolean> | boolean;
  editLinkData?: LinkFormData;
  cards: QueryResult<'tree'>[];
  linkTypes: ExpandedLinkType[];
  cardKey: string;
}

export function EditLinkModal({
  open,
  onClose,
  onSubmit,
  editLinkData,
  cards,
  linkTypes,
  cardKey,
}: EditLinkModalProps) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement>(null);
  const { isUpdating, card } = useCard(cardKey);

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog>
        <ModalClose />
        <DialogTitle>{t('editLinkModal.title')}</DialogTitle>
        <Divider />
        <DialogContent
          sx={{
            paddingBottom: 2,
            paddingX: 1,
          }}
        >
          <LinkForm
            linkTypes={linkTypes}
            cards={cards}
            currentCardLinks={card?.links ?? []}
            onSubmit={async (data) => {
              // When submitting, include the original link information as well
              const result = await onSubmit({
                ...data,
                previousLinkType: editLinkData?.linkTypeName,
                previousCardKey: editLinkData?.cardKey,
                previousLinkDescription: editLinkData?.linkDescription,
                previousDirection: editLinkData?.direction,
              });
              if (result) {
                onClose();
              }
              return result;
            }}
            cardKey={cardKey}
            data={editLinkData}
            state="edit"
            inModal={true}
            formRef={formRef}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => formRef.current?.requestSubmit()}
            color="primary"
            data-cy="editLinkConfirmButton"
            loading={isUpdating('update')}
          >
            {t('update')}
          </Button>
          <Button
            onClick={onClose}
            variant="plain"
            color="neutral"
            disabled={isUpdating()}
          >
            {t('cancel')}
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}

export default EditLinkModal;
