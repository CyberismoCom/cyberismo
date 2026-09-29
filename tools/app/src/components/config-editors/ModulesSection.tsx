/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
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
import { Alert, Button, Stack, Typography } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import type { UpdatePlan } from '@cyberismo/data-handler';
import type { ProjectModule } from '@/lib/api/types';
import {
  fetchModuleUpdatePlan,
  useProjectSettings,
  useProjectSettingsMutations,
} from '@/lib/api';
import { useAppDispatch } from '@/lib/hooks';
import { useModals } from '@/lib/utils';
import { ModuleDeleteModal, InstallModuleModal } from '@/components/modals';
import { addNotification } from '@/lib/slices/notifications';
import { useCleanPrompt } from './useCleanPrompt';
import { moduleName, moduleRow, modulesSignature } from '@/lib/modules';
import ModuleCard from './ModuleCard';

interface ModulesSectionProps {
  disabled: boolean;
}

export function ModulesSection({ disabled }: ModulesSectionProps) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { general } = useProjectSettings(undefined);
  const { updateModule, deleteModule, updateAllModules, isUpdating } =
    useProjectSettingsMutations();
  const { modalOpen, openModal, closeModal } = useModals({
    installModule: false,
  });
  const [moduleToDelete, setModuleToDelete] = useState<ProjectModule | null>(
    null,
  );
  const [moduleToChange, setModuleToChange] = useState<ProjectModule | null>(
    null,
  );
  const { maybePromptClean } = useCleanPrompt();

  const modules = general?.modules;
  const hasRoots = Boolean(modules?.some((mod) => mod.isRoot));
  const canCheck = !disabled && hasRoots;

  // The outcome of the last check, valid only for the modules it was made for.
  const [check, setCheck] = useState<{
    signature: string;
    plan?: UpdatePlan;
    error?: string;
  }>();
  const [checking, setChecking] = useState(false);
  const validCheck =
    check?.signature === modulesSignature(modules) ? check : undefined;

  const busy = isUpdating() || checking || disabled;

  const handleCheck = async () => {
    const signature = modulesSignature(modules);
    setChecking(true);
    let outcome: { plan?: UpdatePlan; error?: string };
    try {
      outcome = { plan: await fetchModuleUpdatePlan() };
    } catch (error) {
      outcome = {
        error: error instanceof Error ? error.message : t('failedToLoad'),
      };
    }
    setCheck({ signature, ...outcome });
    setChecking(false);
  };

  const notifyError = (error: unknown) => {
    dispatch(
      addNotification({
        message: error instanceof Error ? error.message : t('failedToLoad'),
        type: 'error',
      }),
    );
  };

  const handleUpdate = async (mod: ProjectModule) => {
    try {
      await updateModule(mod.cardKeyPrefix);
      await maybePromptClean();
    } catch (error) {
      notifyError(error);
    }
  };

  const handleUpdateAll = async () => {
    try {
      await updateAllModules();
      dispatch(
        addNotification({
          message: t('general.updateAllModulesSuccess'),
          type: 'success',
        }),
      );
      await maybePromptClean();
    } catch (error) {
      notifyError(error);
    }
  };

  const handleDelete = async (mod: ProjectModule) => {
    try {
      await deleteModule(mod.cardKeyPrefix);
      dispatch(
        addNotification({
          message: t('deleteModuleModal.success', { moduleName: mod.name }),
          type: 'success',
        }),
      );
      setModuleToDelete(null);
    } catch (error) {
      notifyError(error);
    }
  };

  return (
    <Stack spacing={1}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography level="title-lg" component="h2">
          {t('general.modulesSection')}
        </Typography>
        <Button
          size="sm"
          variant="solid"
          onClick={openModal('installModule')}
          disabled={busy}
        >
          {t('general.installModule')}
        </Button>
        {!!modules?.length && (
          <Button
            size="sm"
            variant="outlined"
            onClick={handleUpdateAll}
            loading={isUpdating('update-all-modules')}
            disabled={busy}
          >
            {t('general.updateAllModules')}
          </Button>
        )}
        {canCheck && (
          <Button
            size="sm"
            variant="outlined"
            onClick={handleCheck}
            loading={checking}
            disabled={isUpdating()}
          >
            {t('general.checkForUpdates')}
          </Button>
        )}
      </Stack>
      {modules?.length === 0 && <Typography>{t('noModules')}</Typography>}
      {validCheck?.error && (
        <Alert color="warning" variant="soft" role="alert">
          <Stack>
            <Typography level="title-sm">
              {t('general.checkForUpdatesFailed')}
            </Typography>
            <Typography level="body-sm">{validCheck.error}</Typography>
          </Stack>
        </Alert>
      )}
      {validCheck?.plan && !validCheck.plan.ok && (
        <Alert color="warning" variant="soft" role="alert">
          <Stack>
            <Typography level="title-sm">
              {t('general.moduleUpdatesBlocked')}
            </Typography>
            {validCheck.plan.conflicts.map((conflict) => (
              <Typography key={conflict.module} level="body-sm">
                {moduleName(modules ?? [], conflict.module)}: {conflict.reason}
              </Typography>
            ))}
          </Stack>
        </Alert>
      )}
      {modules?.map((mod) => (
        <ModuleCard
          key={mod.cardKeyPrefix}
          module={mod}
          row={moduleRow(mod, validCheck?.plan, modules)}
          disabled={disabled}
          checking={checking}
          isUpdating={isUpdating}
          onUpdate={() => handleUpdate(mod)}
          onChangeVersion={() => setModuleToChange(mod)}
          onDelete={() => setModuleToDelete(mod)}
        />
      ))}
      {moduleToDelete && (
        <ModuleDeleteModal
          open
          onClose={() => setModuleToDelete(null)}
          moduleName={moduleToDelete.name}
          cardKeyPrefix={moduleToDelete.cardKeyPrefix}
          onDelete={() => handleDelete(moduleToDelete)}
          isDeleting={isUpdating(`delete-${moduleToDelete.cardKeyPrefix}`)}
        />
      )}
      {modalOpen.installModule && (
        <InstallModuleModal open onClose={closeModal('installModule')} />
      )}
      {moduleToChange && (
        <InstallModuleModal
          open
          module={moduleToChange}
          onClose={() => setModuleToChange(null)}
          onDone={maybePromptClean}
        />
      )}
    </Stack>
  );
}

export default ModulesSection;
