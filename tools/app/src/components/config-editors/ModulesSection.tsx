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
import type { ProjectModule } from '@/lib/api/types';
import {
  useModuleUpdatePlan,
  useProjectSettings,
  useProjectSettingsMutations,
} from '@/lib/api';
import { useAppDispatch } from '@/lib/hooks';
import { useModals } from '@/lib/utils';
import { ModuleDeleteModal, InstallModuleModal } from '@/components/modals';
import { addNotification } from '@/lib/slices/notifications';
import { useCleanPrompt } from './useCleanPrompt';
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
    deleteModule: false,
    installModule: false,
  });
  const [moduleToDelete, setModuleToDelete] = useState<ProjectModule | null>(
    null,
  );
  const [moduleToChange, setModuleToChange] = useState<ProjectModule | null>(
    null,
  );
  const [checkRequested, setCheckRequested] = useState(false);
  const { maybePromptClean } = useCleanPrompt();

  const modules = general?.modules;
  const hasRoots = Boolean(modules?.some((mod) => mod.isRoot));
  const canCheck = !disabled && hasRoots;
  const {
    data: plan,
    error: checkError,
    isValidating: checking,
    mutate: recheck,
  } = useModuleUpdatePlan(checkRequested && canCheck);

  // The plan describes the tree as it was; drop it once the tree changes.
  const clearPlan = async () => {
    setCheckRequested(false);
    await recheck(undefined, false);
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
      await clearPlan();
      await maybePromptClean();
    } catch (error) {
      notifyError(error);
    }
  };

  const handleUpdateAll = async () => {
    try {
      await updateAllModules();
      await clearPlan();
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
      await clearPlan();
      dispatch(
        addNotification({
          message: t('deleteModuleModal.success', { moduleName: mod.name }),
          type: 'success',
        }),
      );
      setModuleToDelete(null);
      closeModal('deleteModule')();
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
          disabled={isUpdating() || disabled}
        >
          {t('general.installModule')}
        </Button>
        {modules?.length ? (
          <Button
            size="sm"
            variant="outlined"
            onClick={handleUpdateAll}
            loading={isUpdating('update-all-modules')}
            disabled={isUpdating() || disabled}
          >
            {t('general.updateAllModules')}
          </Button>
        ) : null}
        {canCheck && (
          <Button
            size="sm"
            variant="outlined"
            onClick={() =>
              checkRequested ? recheck() : setCheckRequested(true)
            }
            loading={checking}
            disabled={isUpdating()}
          >
            {t('general.checkForUpdates')}
          </Button>
        )}
      </Stack>
      {modules?.length === 0 && <Typography>{t('noModules')}</Typography>}
      {checkRequested && checkError && (
        <Alert color="warning" variant="soft" role="alert">
          <Stack>
            <Typography level="title-sm">
              {t('general.checkForUpdatesFailed')}
            </Typography>
            <Typography level="body-sm">{checkError.message}</Typography>
          </Stack>
        </Alert>
      )}
      {plan && !plan.ok && !checkError && (
        <Alert color="warning" variant="soft" role="alert">
          <Stack>
            <Typography level="title-sm">
              {t('general.moduleUpdatesBlocked')}
            </Typography>
            {plan.conflicts.map((conflict) => (
              <Typography key={conflict.module} level="body-sm">
                {conflict.module}: {conflict.reason}
              </Typography>
            ))}
          </Stack>
        </Alert>
      )}
      {plan?.ok && !checkError && plan.unchecked.length > 0 && (
        <Typography level="body-sm">
          {t('general.moduleNotChecked', {
            modules: plan.unchecked
              .map(
                (prefix) =>
                  modules?.find((m) => m.cardKeyPrefix === prefix)?.name ??
                  prefix,
              )
              .join(', '),
          })}
        </Typography>
      )}
      {modules?.map((mod) => (
        <ModuleCard
          key={mod.cardKeyPrefix}
          module={mod}
          modules={modules}
          disabled={disabled}
          isUpdating={isUpdating}
          plan={plan}
          checkFailed={Boolean(checkError)}
          onUpdate={() => handleUpdate(mod)}
          onChangeVersion={() => setModuleToChange(mod)}
          onDelete={() => {
            setModuleToDelete(mod);
            openModal('deleteModule')();
          }}
        />
      ))}
      {moduleToDelete && (
        <ModuleDeleteModal
          open={modalOpen.deleteModule}
          onClose={() => {
            setModuleToDelete(null);
            closeModal('deleteModule')();
          }}
          moduleName={moduleToDelete.name}
          cardKeyPrefix={moduleToDelete.cardKeyPrefix}
          onDelete={() => handleDelete(moduleToDelete)}
          isDeleting={isUpdating(`delete-${moduleToDelete.cardKeyPrefix}`)}
        />
      )}
      {modalOpen.installModule && (
        <InstallModuleModal
          open
          onClose={closeModal('installModule')}
          onDone={clearPlan}
        />
      )}
      {moduleToChange && (
        <InstallModuleModal
          open
          module={moduleToChange}
          onClose={() => setModuleToChange(null)}
          onDone={async () => {
            await clearPlan();
            await maybePromptClean();
          }}
        />
      )}
    </Stack>
  );
}

export default ModulesSection;
