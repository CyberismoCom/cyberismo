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

import CodeMirror from '@uiw/react-codemirror';
import type { CalculationNode } from '@/lib/api/types';
import BaseEditor from './BaseEditor';
import { addNotification } from '@/lib/slices/notifications';
import { useAppDispatch } from '@/lib/hooks';
import { useTranslation } from 'react-i18next';
import { CODE_MIRROR_BASE_PROPS, TITLE_FIELD_PROPS } from '@/lib/constants';
import { Textarea } from '@mui/joy';
import { Controller, useForm } from 'react-hook-form';
import { useEffect } from 'react';
import { isEdited } from '@/lib/slices/pageState';
import { useResource } from '@/lib/api';

export function CalculationEditor({ node }: { node: CalculationNode }) {
  const dispatch = useAppDispatch();
  const { t } = useTranslation();
  const { update, isUpdating } = useResource(node.name);
  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty },
  } = useForm({
    defaultValues: {
      calculation: node.data.content.calculation,
      displayName: node.data.displayName,
    },
  });

  useEffect(() => {
    if (isDirty) {
      dispatch(isEdited(true));
    }
  }, [isDirty, dispatch]);

  useEffect(() => {
    return () => {
      dispatch(isEdited(false));
    };
  }, [dispatch]);

  return (
    <BaseEditor
      node={node}
      onCancel={() =>
        reset({
          calculation: node.data.calculation,
          displayName: node.data.displayName,
        })
      }
      onUpdate={handleSubmit(async (data) => {
        try {
          await update({
            updateKey: { key: 'content', subKey: 'calculation' },
            operation: {
              name: 'change',
              target: node.data.calculation,
              to: data.calculation,
            },
          });
          dispatch(
            addNotification({
              message: t('saveFile.success'),
              type: 'success',
            }),
          );
          reset({
            calculation: data.calculation,
          });
        } catch (error) {
          dispatch(
            addNotification({
              message:
                error instanceof Error ? error.message : t('saveFile.error'),
              type: 'error',
            }),
          );
        }
      })}
      loading={isUpdating()}
      isDirty={isDirty}
    >
      <Controller
        control={control}
        name="displayName"
        render={({ field }) => (
          <Textarea
            {...TITLE_FIELD_PROPS}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      <Controller
        control={control}
        name="calculation"
        render={({ field }) => (
          <CodeMirror
            {...CODE_MIRROR_BASE_PROPS}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
    </BaseEditor>
  );
}
