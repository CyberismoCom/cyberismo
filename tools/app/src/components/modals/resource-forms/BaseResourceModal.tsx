/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { useState } from 'react';
import {
  Modal,
  ModalDialog,
  DialogTitle,
  DialogContent,
  ModalClose,
  Divider,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { useAppDispatch } from '@/lib/hooks';
import { addNotification } from '@/lib/slices/notifications';
import { useNavigate } from 'react-router';

export interface ResourceFormProps<T> {
  onSubmit: (data: T) => Promise<void>;
  isSubmitting: boolean;
}

interface BaseResourceModalProps<
  T,
  U extends Record<string, unknown> = Record<string, never>,
> {
  open: boolean;
  onClose: () => void;
  title: string;
  createFn: (data: T) => Promise<string>;
  FormComponent: React.ComponentType<ResourceFormProps<T> & U>;
  FormComponentProps?: U;
}

export function BaseResourceModal<
  T,
  U extends Record<string, unknown> = Record<string, never>,
>({
  open,
  onClose,
  title,
  createFn,
  FormComponent,
  FormComponentProps,
}: BaseResourceModalProps<T, U>) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (data: T) => {
    setIsSubmitting(true);
    try {
      const name = await createFn(data);

      dispatch(
        addNotification({
          message: t('newResourceModal.success', {
            resourceType: title,
          }),
          type: 'success',
        }),
      );
      onClose();
      navigate(`configuration/${name}`);
    } catch (error) {
      dispatch(
        addNotification({
          message: error instanceof Error ? error.message : 'Unknown error',
          type: 'error',
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog size="md">
        <ModalClose />
        <DialogTitle>{title}</DialogTitle>
        <Divider />
        <DialogContent>
          <FormComponent
            {...({
              onSubmit: handleSubmit,
              isSubmitting: isSubmitting,
              ...FormComponentProps,
            } as ResourceFormProps<T> & U)}
          />
        </DialogContent>
      </ModalDialog>
    </Modal>
  );
}

export default BaseResourceModal;
