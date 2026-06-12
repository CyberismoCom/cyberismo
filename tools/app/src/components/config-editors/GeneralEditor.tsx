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
  Textarea,
  IconButton,
  Input,
  FormControl,
  FormLabel,
  Tooltip,
} from '@mui/joy';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AddIcon from '@mui/icons-material/Add';
import type { GenericNode, Hub, HubModule } from '@/lib/api/types';
import {
  useHubs,
  useProjectSettings,
  useProjectSettingsMutations,
  usePublicKey,
} from '@/lib/api';
import { useEditableField, useAppDispatch } from '@/lib/hooks';
import { useModals } from '@/lib/utils';
import {
  ModuleDeleteModal,
  AddModuleModal,
  HubDeleteModal,
} from '@/components/modals';
import { addNotification } from '@/lib/slices/notifications';
import BaseEditor from './BaseEditor';
import FieldRow from './fields/FieldRow';
import TextInput from './fields/TextInput';
import TextareaInput from './fields/TextareaInput';
import { UserRole, useHasMinRole } from '@/lib/auth';

type GeneralEditorProps = {
  node: GenericNode<'general'>;
};

export function GeneralEditor({ node }: GeneralEditorProps) {
  const { t } = useTranslation();
  const { general, isLoading } = useProjectSettings(undefined);
  const { publicKey } = usePublicKey();
  const {
    updateModule,
    deleteModule,
    updateAllModules,
    addModule,
    addHub,
    removeHub,
    fetchHubs,
    isUpdating,
    updateProject,
  } = useProjectSettingsMutations();
  const { data: hubs } = useHubs();
  const { modalOpen, openModal, closeModal } = useModals({
    deleteModule: false,
    addModule: false,
    deleteHub: false,
  });
  const [moduleToDelete, setModuleToDelete] = useState<{
    name: string;
    cardKeyPrefix: string;
  } | null>(null);
  const [hubToDelete, setHubToDelete] = useState<Hub | null>(null);
  const [hubUrl, setHubUrl] = useState('');
  const [importingModule, setImportingModule] = useState<string | null>(null);
  const dispatch = useAppDispatch();
  const isAdmin = useHasMinRole(UserRole.Admin);

  const isDisabled = Boolean(node.readOnly) || !isAdmin;

  const nameField = useEditableField({
    initialValue: general?.name ?? node.data.name ?? '',
    actionKey: 'update-name',
    readOnly: isDisabled,
    isLoading,
    isUpdating,
    saveValue: (value) => updateProject({ name: value }, 'update-name'),
  });

  const cardKeyPrefixField = useEditableField({
    initialValue: general?.cardKeyPrefix ?? node.data.cardKeyPrefix ?? '',
    actionKey: 'update-cardKeyPrefix',
    readOnly: isDisabled,
    isLoading,
    isUpdating,
    saveValue: (value) =>
      updateProject({ cardKeyPrefix: value }, 'update-cardKeyPrefix'),
  });

  const categoryField = useEditableField({
    initialValue: general?.category ?? node.data.category ?? '',
    actionKey: 'update-category',
    readOnly: isDisabled,
    isLoading,
    isUpdating,
    saveValue: (value) => updateProject({ category: value }, 'update-category'),
  });

  const descriptionField = useEditableField({
    initialValue: general?.description ?? node.data.description ?? '',
    actionKey: 'update-description',
    readOnly: isDisabled,
    isLoading,
    isUpdating,
    saveValue: (value) =>
      updateProject({ description: value }, 'update-description'),
  });

  const isGitRepo = general != null && general.gitRemoteUrl !== null;

  const gitRemoteUrlField = useEditableField({
    initialValue: general?.gitRemoteUrl ?? '',
    actionKey: 'update-gitRemoteUrl',
    readOnly: isDisabled || !isGitRepo,
    isLoading,
    isUpdating,
    saveValue: (value) =>
      updateProject({ gitRemoteUrl: value }, 'update-gitRemoteUrl'),
  });

  const [copied, setCopied] = useState(false);

  const handleCopyPublicKey = async () => {
    if (publicKey) {
      await navigator.clipboard.writeText(publicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const notifyError = (error: unknown) => {
    dispatch(
      addNotification({
        message: error instanceof Error ? error.message : t('failedToLoad'),
        type: 'error',
      }),
    );
  };

  const handleAddHub = async () => {
    const location = hubUrl.trim();
    if (!location) {
      return;
    }
    try {
      await addHub(location);
      setHubUrl('');
      dispatch(
        addNotification({
          message: t('general.addHubSuccess'),
          type: 'success',
        }),
      );
    } catch (error) {
      notifyError(error);
    }
  };

  const handleHubsUpdate = async () => {
    try {
      await fetchHubs();
      dispatch(
        addNotification({
          message: t('general.updateHubsSuccess'),
          type: 'success',
        }),
      );
    } catch (error) {
      notifyError(error);
    }
  };

  const handleHubDelete = async (hub: Hub) => {
    try {
      await removeHub(hub.location);
      dispatch(
        addNotification({
          message: t('deleteHubModal.success', {
            hubName: hub.displayName || hub.location,
          }),
          type: 'success',
        }),
      );
      setHubToDelete(null);
      closeModal('deleteHub')();
    } catch (error) {
      notifyError(error);
    }
  };

  const handleHubModuleImport = async (module: HubModule) => {
    setImportingModule(module.name);
    try {
      await addModule(module.location);
      dispatch(
        addNotification({
          message: t('addModuleModal.success'),
          type: 'success',
        }),
      );
    } catch (error) {
      notifyError(error);
    } finally {
      setImportingModule(null);
    }
  };

  const handleModuleDelete = async (moduleToDelete: {
    name: string;
    cardKeyPrefix: string;
  }) => {
    try {
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
          message: error instanceof Error ? error.message : t('failedToLoad'),
          type: 'error',
        }),
      );
    }
  };

  return (
    <BaseEditor node={node}>
      <Stack>
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
        <FieldRow
          dirty={categoryField.dirty}
          onSave={() => categoryField.save()}
          onCancel={() => categoryField.cancel()}
        >
          <TextInput
            label={t('general.projectCategory')}
            value={categoryField.value}
            onChange={(value) => categoryField.setValue(value)}
            disabled={categoryField.disabled}
          />
        </FieldRow>
        <FieldRow
          dirty={descriptionField.dirty}
          onSave={() => descriptionField.save()}
          onCancel={() => descriptionField.cancel()}
        >
          <TextareaInput
            label={t('general.projectDescription')}
            value={descriptionField.value}
            onChange={(value) => descriptionField.setValue(value)}
            disabled={descriptionField.disabled}
          />
        </FieldRow>

        <FieldRow
          dirty={gitRemoteUrlField.dirty}
          onSave={() => gitRemoteUrlField.save()}
          onCancel={() => gitRemoteUrlField.cancel()}
        >
          <TextInput
            label={t('general.gitRemoteUrl')}
            value={
              isGitRepo ? gitRemoteUrlField.value : t('general.notAGitRepo')
            }
            onChange={(value) => gitRemoteUrlField.setValue(value)}
            disabled={gitRemoteUrlField.disabled}
          />
        </FieldRow>

        {isGitRepo && publicKey && (
          <Stack spacing={0.5} mb={4.5}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography level="title-md">
                {t('general.gitPushPublicKey')}
              </Typography>
              <Tooltip
                title={
                  copied
                    ? t('general.copiedToClipboard')
                    : t('general.copyToClipboard')
                }
              >
                <IconButton
                  size="sm"
                  variant="plain"
                  onClick={handleCopyPublicKey}
                >
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
            <Textarea
              readOnly
              minRows={2}
              maxRows={4}
              value={publicKey}
              sx={{ fontFamily: 'monospace', fontSize: 'sm' }}
            />
          </Stack>
        )}

        <Stack spacing={1}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography level="title-lg">
              {t('general.modulesSection')}
            </Typography>
            <Button
              size="sm"
              variant="solid"
              onClick={openModal('addModule')}
              disabled={isUpdating() || isDisabled}
            >
              {t('general.addModule')}
            </Button>
            {general?.modules.length ? (
              <Button
                size="sm"
                variant="outlined"
                onClick={async () => {
                  if (!general?.modules?.length) {
                    return;
                  }
                  try {
                    await updateAllModules();
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
                disabled={isUpdating() || isDisabled}
              >
                {t('general.updateAllModules')}
              </Button>
            ) : null}
          </Stack>
          {!general?.modules ||
            (general.modules.length === 0 && (
              <Typography>{t('noModules')}</Typography>
            ))}
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
                    isUpdating() ||
                    isDisabled
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
                    isUpdating(`delete-${mod.cardKeyPrefix}`) || isDisabled
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

        <Stack spacing={1} mt={4}>
          <Typography level="title-lg">{t('general.hubsSection')}</Typography>
          <FormControl>
            <FormLabel>{t('general.addHub')} *</FormLabel>
            <Input
              placeholder={t('general.hubLocationUrl')}
              value={hubUrl}
              onChange={(e) => setHubUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAddHub();
                }
              }}
              disabled={isDisabled || isUpdating()}
              endDecorator={
                <IconButton
                  size="sm"
                  variant="solid"
                  color="primary"
                  onClick={handleAddHub}
                  loading={isUpdating('add-hub')}
                  disabled={!hubUrl.trim() || isDisabled || isUpdating()}
                  data-cy="addHubButton"
                >
                  <AddIcon />
                </IconButton>
              }
            />
          </FormControl>
          {hubs && hubs.length === 0 && <Typography>{t('noHubs')}</Typography>}
          {hubs?.map((hub) => (
            <Card key={hub.location} size="sm" variant="outlined">
              <CardContent>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="flex-start"
                  spacing={1}
                >
                  <Stack>
                    <Typography level="title-sm">
                      {hub.displayName || hub.location}
                    </Typography>
                    {hub.displayName && (
                      <Typography level="body-sm">{hub.location}</Typography>
                    )}
                  </Stack>
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="sm"
                      variant="outlined"
                      loading={isUpdating('update-hubs')}
                      disabled={isUpdating() || isDisabled}
                      onClick={handleHubsUpdate}
                    >
                      {t('update')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outlined"
                      color="danger"
                      loading={isUpdating(`delete-hub-${hub.location}`)}
                      disabled={isUpdating() || isDisabled}
                      onClick={() => {
                        setHubToDelete(hub);
                        openModal('deleteHub')();
                      }}
                    >
                      {t('delete')}
                    </Button>
                  </Stack>
                </Stack>
                <Typography level="title-sm" mt={1}>
                  {t('general.modulesSection')}
                </Typography>
                {hub.modules.length === 0 ? (
                  <Typography level="body-sm">
                    {t('general.noHubModules')}
                  </Typography>
                ) : (
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {hub.modules.map((mod) => (
                      <Card
                        key={mod.name}
                        size="sm"
                        variant="outlined"
                        sx={{ width: 180 }}
                      >
                        <CardContent>
                          <Stack
                            direction="row"
                            justifyContent="space-between"
                            alignItems="flex-start"
                            spacing={1}
                          >
                            <Typography level="title-sm">
                              {mod.displayName || mod.name}
                            </Typography>
                            <Tooltip
                              title={
                                mod.imported
                                  ? t('general.moduleAlreadyImported')
                                  : t('general.addModule')
                              }
                            >
                              <span>
                                <IconButton
                                  size="sm"
                                  variant="plain"
                                  color="primary"
                                  loading={importingModule === mod.name}
                                  disabled={
                                    mod.imported || isDisabled || isUpdating()
                                  }
                                  onClick={() => handleHubModuleImport(mod)}
                                >
                                  <AddIcon />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </Stack>
                          <Typography level="body-sm">
                            {t('general.cardKeyPrefix')}: {mod.name}
                          </Typography>
                        </CardContent>
                      </Card>
                    ))}
                  </Stack>
                )}
              </CardContent>
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
          onDelete={() => handleModuleDelete(moduleToDelete)}
          isDeleting={isUpdating(`delete-${moduleToDelete.cardKeyPrefix}`)}
        />
      )}
      {hubToDelete && (
        <HubDeleteModal
          open={modalOpen.deleteHub}
          onClose={() => {
            setHubToDelete(null);
            closeModal('deleteHub')();
          }}
          hubName={hubToDelete.displayName || hubToDelete.location}
          onDelete={() => handleHubDelete(hubToDelete)}
          isDeleting={isUpdating(`delete-hub-${hubToDelete.location}`)}
        />
      )}
      <AddModuleModal
        open={modalOpen.addModule}
        onClose={closeModal('addModule')}
        onAdd={addModule}
      />
    </BaseEditor>
  );
}

export default GeneralEditor;
