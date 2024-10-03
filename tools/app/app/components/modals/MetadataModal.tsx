/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { useTranslation } from 'react-i18next';

import {
  Modal,
  ModalDialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Table,
} from '@mui/joy';
import { useCard } from '@/app/lib/api';
import { CardMetadata } from '@cyberismocom/data-handler/interfaces/project-interfaces';
import moment from 'moment';

function Metadata({
  cardType,
  title,
  workflowState,
  lastTransitioned,
}: CardMetadata) {
  const { t } = useTranslation();
  return (
    <Table size="sm">
      <thead>
        <tr>
          <th>{t('name')}</th>
          <th>{t('value')}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>{t('cardType')}</td>
          <td>{cardType}</td>
        </tr>
        <tr>
          <td>{t('title')}</td>
          <td>{title}</td>
        </tr>
        <tr>
          <td>{t('workflowState')}</td>
          <td>{workflowState}</td>
        </tr>
        <tr>
          <td>{t('lastTransitioned')}</td>
          <td>{lastTransitioned && moment(lastTransitioned).fromNow()}</td>
        </tr>
      </tbody>
    </Table>
  );
}

export interface MetadataModalProps {
  open: boolean;
  onClose: () => void;
  cardKey: string;
}

export function MetadataModal({ open, onClose, cardKey }: MetadataModalProps) {
  const { t } = useTranslation();
  const { card } = useCard(cardKey);

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog>
        <DialogTitle id="metadata-modal-title" level="title-md" component="h2">
          {card?.key} {t('metadata').toLowerCase()}
        </DialogTitle>
        <DialogContent>
          {card?.metadata ? (
            <Metadata {...card.metadata} />
          ) : (
            <Typography level="body-xs">{t('metadataNotFound')}</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} autoFocus>
            {t('close')}
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}

export default MetadataModal;
