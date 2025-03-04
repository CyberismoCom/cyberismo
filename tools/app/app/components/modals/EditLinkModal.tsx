/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import React, { useRef } from 'react';
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
import { ExpandedLinkType } from '@/app/lib/definitions';
import { LinkForm } from '../ContentArea';
import { QueryResult, LinkDirection } from '@cyberismocom/data-handler/types/queries';

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
    previousLinkDescription?: string;
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

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog>
        <ModalClose />
        <DialogTitle>{t('editLinkModal.title')}</DialogTitle>
        <Divider />
        <DialogContent sx={{
          paddingBottom: 2 
        }}>
          <LinkForm
            linkTypes={linkTypes}
            cards={cards}
            onSubmit={async (data) => {
              const result = await onSubmit(data);
              if (result) {
                onClose();
              }
              return result;
            }}
            cardKey={cardKey}
            data={editLinkData && {
              linkType: editLinkData.linkType,
              cardKey: editLinkData.cardKey,
              linkDescription: editLinkData.linkDescription,
            }}
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
          >
            {t('update')}
          </Button>
          <Button 
            onClick={onClose} 
            variant="plain" 
            color="neutral"
            loading={false}
          >
            {t('cancel')}
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}

export default EditLinkModal;