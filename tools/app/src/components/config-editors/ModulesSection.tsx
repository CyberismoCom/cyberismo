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

import { useRef, useState } from 'react';
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
import { ModuleDeleteModal, AddModuleModal } from '@/components/modals';
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
  const {
    updateModule,
    deleteModule,
    updateAllModules,
    addModule,
    isUpdating,
  } = useProjectSettingsMutations();
  const { modalOpen, openModal, closeModal } = useModals({
    deleteModule: false,
    addModule: false,
  });
  const [moduleToDelete, setModuleToDelete] = useState<ProjectModule | null>(
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
  const latestCheck = useRef(0);
  const shown =
    check?.signature === modulesSignature(modules) ? check : undefined;

  const handleCheck = async () => {
    const id = ++latestCheck.current;
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
    if (id !== latestCheck.current) return;
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
          onClick={openModal('addModule')}
          disabled={isUpdating() || checking || disabled}
        >
          {t('general.addModule')}
        </Button>
        {modules?.length ? (
          <Button
            size="sm"
            variant="outlined"
            onClick={handleUpdateAll}
            loading={isUpdating('update-all-modules')}
            disabled={isUpdating() || checking || disabled}
          >
            {t('general.updateAllModules')}
          </Button>
        ) : null}
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
      {shown?.error && (
        <Alert color="warning" variant="soft" role="alert">
          <Stack>
            <Typography level="title-sm">
              {t('general.checkForUpdatesFailed')}
            </Typography>
            <Typography level="body-sm">{shown.error}</Typography>
          </Stack>
        </Alert>
      )}
      {shown?.plan && !shown.plan.ok && (
        <Alert color="warning" variant="soft" role="alert">
          <Stack>
            <Typography level="title-sm">
              {t('general.moduleUpdatesBlocked')}
            </Typography>
            {shown.plan.conflicts.map((conflict) => (
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
          row={moduleRow(mod, shown?.plan, modules)}
          disabled={disabled}
          checking={checking}
          isUpdating={isUpdating}
          onUpdate={() => handleUpdate(mod)}
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
      <AddModuleModal
        open={modalOpen.addModule}
        onClose={closeModal('addModule')}
        onAdd={async (source) => {
          await addModule(source);
        }}
      />
    </Stack>
  );
}

export default ModulesSection;
