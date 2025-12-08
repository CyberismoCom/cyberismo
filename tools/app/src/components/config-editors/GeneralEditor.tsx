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
import {
  Stack,
  Typography,
  Card,
  CardContent,
  CardActions,
  Button,
} from '@mui/joy';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GenericNode } from '@/lib/api/types';
import { useProjectSettings, useProjectSettingsMutations } from '@/lib/api';
import { useEditableField, useAppDispatch } from '@/lib/hooks';
import { useModals } from '@/lib/utils';
import { ModuleDeleteModal } from '@/components/modals';
import { addNotification } from '@/lib/slices/notifications';
import BaseEditor from './BaseEditor';
import FieldRow from './fields/FieldRow';
import TextInput from './fields/TextInput';

type GeneralEditorProps = {
  node: GenericNode<'general'>;
};

export function GeneralEditor({ node }: GeneralEditorProps) {
  const { t } = useTranslation();
  const { general, isLoading } = useProjectSettings(undefined);
  const {
    updateModule,
    deleteModule,
    updateAllModules,
    isUpdating,
    updateProject,
  } = useProjectSettingsMutations();
  const { modalOpen, openModal, closeModal } = useModals({
    deleteModule: false,
  });
  const [moduleToDelete, setModuleToDelete] = useState<{
    name: string;
    cardKeyPrefix: string;
  } | null>(null);
  const dispatch = useAppDispatch();

  const nameField = useEditableField({
    initialValue: general?.name ?? node.data.name ?? '',
    actionKey: 'update-name',
    readOnly: Boolean(node.readOnly),
    isLoading,
    isUpdating,
    saveValue: (value) => updateProject({ name: value }, 'update-name'),
  });

  const cardKeyPrefixField = useEditableField({
    initialValue: general?.cardKeyPrefix ?? node.data.cardKeyPrefix ?? '',
    actionKey: 'update-cardKeyPrefix',
    readOnly: Boolean(node.readOnly),
    isLoading,
    isUpdating,
    saveValue: (value) =>
      updateProject({ cardKeyPrefix: value }, 'update-cardKeyPrefix'),
  });

  return (
    <BaseEditor node={node}>
      <Stack spacing={2}>
        <FieldRow
          dirty={nameField.dirty}
          onSave={() => nameField.save()}
          onCancel={() => nameField.cancel()}
        >
          <TextInput
            label={t('general.projectName')}
            value={nameField.value}
            onChange={(value) => nameField.setValue(value)}
            disabled={nameField.disabled}
          />
        </FieldRow>
        <FieldRow
          dirty={cardKeyPrefixField.dirty}
          onSave={() => cardKeyPrefixField.save()}
          onCancel={() => cardKeyPrefixField.cancel()}
        >
          <TextInput
            label={t('general.cardKeyPrefix')}
            value={cardKeyPrefixField.value}
            onChange={(value) => cardKeyPrefixField.setValue(value)}
            disabled={cardKeyPrefixField.disabled}
          />
        </FieldRow>

        <Stack spacing={1}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography level="title-lg">
              {t('general.modulesSection')}
            </Typography>
            <Button
              size="sm"
              variant="outlined"
              onClick={async () => {
                if (!general?.modules?.length) {
                  return;
                }
                try {
                  await updateAllModules(
                    general.modules.map((mod) => mod.cardKeyPrefix),
                  );
                  dispatch(
                    addNotification({
                      message: t('general.updateAllModulesSuccess'),
                      type: 'success',
                    }),
                  );
                } catch (error) {
                  dispatch(
                    addNotification({
                      message:
                        error instanceof Error
                          ? error.message
                          : t('failedToLoad'),
                      type: 'error',
                    }),
                  );
                }
              }}
              loading={isUpdating('update-all-modules')}
              disabled={
                isUpdating('update-all-modules') ||
                !general?.modules?.length ||
                node.readOnly
              }
            >
              {t('general.updateAllModules')}
            </Button>
          </Stack>
          {general?.modules?.map((mod) => (
            <Card key={mod.cardKeyPrefix} size="sm" variant="outlined">
              <CardContent>
                <Typography level="title-sm">{mod.name}</Typography>
                <Typography level="body-sm">
                  {t('general.cardKeyPrefix')}: {mod.cardKeyPrefix}
                </Typography>
              </CardContent>
              <CardActions>
                <Button
                  size="sm"
                  variant="outlined"
                  loading={isUpdating(`update-${mod.cardKeyPrefix}`)}
                  disabled={
                    isUpdating(`update-${mod.cardKeyPrefix}`) ||
                    isUpdating('update-all-modules') ||
                    node.readOnly
                  }
                  onClick={() => updateModule(mod.cardKeyPrefix)}
                >
                  {t('update')}
                </Button>
                <Button
                  size="sm"
                  variant="outlined"
                  color="danger"
                  loading={isUpdating(`delete-${mod.cardKeyPrefix}`)}
                  disabled={
                    isUpdating(`delete-${mod.cardKeyPrefix}`) || node.readOnly
                  }
                  onClick={() => {
                    setModuleToDelete(mod);
                    openModal('deleteModule')();
                  }}
                >
                  {t('delete')}
                </Button>
              </CardActions>
            </Card>
          ))}
        </Stack>
      </Stack>
      {moduleToDelete && (
        <ModuleDeleteModal
          open={modalOpen.deleteModule}
          onClose={() => {
            setModuleToDelete(null);
            closeModal('deleteModule')();
          }}
          moduleName={moduleToDelete.name}
          cardKeyPrefix={moduleToDelete.cardKeyPrefix}
          onDelete={async () => {
            try {
              if (!moduleToDelete) {
                return;
              }
              await deleteModule(moduleToDelete.cardKeyPrefix);
              dispatch(
                addNotification({
                  message: t('deleteModuleModal.success', {
                    moduleName: moduleToDelete.name,
                  }),
                  type: 'success',
                }),
              );
              setModuleToDelete(null);
              closeModal('deleteModule')();
            } catch (error) {
              dispatch(
                addNotification({
                  message:
                    error instanceof Error ? error.message : t('failedToLoad'),
                  type: 'error',
                }),
              );
            }
          }}
          isDeleting={isUpdating(`delete-${moduleToDelete.cardKeyPrefix}`)}
        />
      )}
    </BaseEditor>
  );
}

export default GeneralEditor;
