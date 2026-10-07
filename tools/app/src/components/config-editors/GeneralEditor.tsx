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
import { Stack, Typography, Textarea, IconButton, Tooltip } from '@mui/joy';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import type { GenericNode } from '@/lib/api/types';
import {
  useProjectSettings,
  useProjectSettingsMutations,
  usePublicKey,
} from '@/lib/api';
import { useEditableField } from '@/lib/hooks';
import BaseEditor from './BaseEditor';
import FieldRow from './fields/FieldRow';
import HubsSection from './HubsSection';
import ModulesSection from './ModulesSection';
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
  const { isUpdating, updateProject } = useProjectSettingsMutations();
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

        <ModulesSection disabled={isDisabled} />

        <HubsSection disabled={isDisabled} />
      </Stack>
    </BaseEditor>
  );
}

export default GeneralEditor;
