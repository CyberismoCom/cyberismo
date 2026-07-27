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
import {
  Button,
  Card,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Stack,
  Tooltip,
  Typography,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import type { Hub, HubModule, UnreachableHub } from '@/lib/api/types';
import { useHubs, useProjectSettingsMutations } from '@/lib/api';
import { useAppDispatch } from '@/lib/hooks';
import { useModals } from '@/lib/utils';
import { HubDeleteModal } from '@/components/modals';
import { OptionCard } from '@/components/OptionCard';
import { addNotification } from '@/lib/slices/notifications';

interface HubsSectionProps {
  disabled: boolean;
}

/**
 * Lists the hubs the project reads modules from, and lets an admin add,
 * remove and refresh them. Refreshing is project-wide because a hub cannot be
 * fetched on its own.
 */
export function HubsSection({ disabled }: HubsSectionProps) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { data: hubs, isLoading } = useHubs();
  const { addHub, removeHub, fetchHubs, addModule, isUpdating } =
    useProjectSettingsMutations();
  const { modalOpen, openModal, closeModal } = useModals({ deleteHub: false });

  const [hubUrl, setHubUrl] = useState('');
  const [hubToDelete, setHubToDelete] = useState<Hub | null>(null);
  const [importingModule, setImportingModule] = useState<string | null>(null);

  const notifyError = (error: unknown) => {
    dispatch(
      addNotification({
        message: error instanceof Error ? error.message : t('failedToLoad'),
        type: 'error',
      }),
    );
  };

  const notifySuccess = (message: string) => {
    dispatch(addNotification({ message, type: 'success' }));
  };

  // Reachable hubs are refreshed regardless, so an unreachable one is a
  // warning about that hub rather than a failure of the whole action.
  const notifyOutcome = (
    unreachable: UnreachableHub[],
    successMessage: string,
  ) => {
    if (unreachable.length === 0) {
      notifySuccess(successMessage);
      return;
    }
    dispatch(
      addNotification({
        message: t('general.hubsUnreachable', {
          hubs: unreachable.map((hub) => hub.location).join(', '),
        }),
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
      const unreachable = await addHub(location);
      setHubUrl('');
      notifyOutcome(unreachable, t('general.addHubSuccess'));
    } catch (error) {
      notifyError(error);
    }
  };

  const handleFetchHubs = async () => {
    try {
      notifyOutcome(await fetchHubs(), t('general.updateHubsSuccess'));
    } catch (error) {
      notifyError(error);
    }
  };

  const handleDeleteHub = async (hub: Hub) => {
    try {
      await removeHub(hub.location);
      notifySuccess(
        t('deleteHubModal.success', {
          hubName: hub.displayName || hub.location,
        }),
      );
      setHubToDelete(null);
      closeModal('deleteHub')();
    } catch (error) {
      notifyError(error);
    }
  };

  const handleImportModule = async (module: HubModule) => {
    setImportingModule(module.name);
    try {
      await addModule(module.location);
      notifySuccess(t('addModuleModal.success'));
    } catch (error) {
      notifyError(error);
    } finally {
      setImportingModule(null);
    }
  };

  return (
    <Stack spacing={1} mt={4}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography level="title-lg" component="h2">
          {t('general.hubsSection')}
        </Typography>
        {hubs?.length ? (
          <Button
            size="sm"
            variant="outlined"
            onClick={handleFetchHubs}
            loading={isUpdating('update-hubs')}
            disabled={isUpdating() || disabled}
          >
            {t('general.updateHubs')}
          </Button>
        ) : null}
      </Stack>

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
          disabled={disabled || isUpdating()}
          endDecorator={
            <IconButton
              size="sm"
              variant="solid"
              color="primary"
              onClick={handleAddHub}
              loading={isUpdating('add-hub')}
              disabled={!hubUrl.trim() || disabled || isUpdating()}
              aria-label={t('general.addHub')}
              data-cy="addHubButton"
            >
              <AddIcon />
            </IconButton>
          }
        />
      </FormControl>

      {!isLoading && hubs?.length === 0 && (
        <Typography>{t('noHubs')}</Typography>
      )}

      {hubs?.map((hub) => (
        <Card key={hub.location} size="sm" variant="soft" color="neutral">
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="flex-start"
            spacing={1}
          >
            <Stack minWidth={0}>
              <Typography level="title-md" component="h3" noWrap>
                {hub.displayName || hub.location}
              </Typography>
              {hub.displayName && (
                <Typography
                  level="body-xs"
                  noWrap
                  sx={{ color: 'text.tertiary' }}
                >
                  {hub.location}
                </Typography>
              )}
            </Stack>
            <Button
              size="sm"
              variant="soft"
              color="danger"
              loading={isUpdating(`delete-hub-${hub.location}`)}
              disabled={isUpdating() || disabled}
              onClick={() => {
                setHubToDelete(hub);
                openModal('deleteHub')();
              }}
            >
              {t('delete')}
            </Button>
          </Stack>

          <Typography level="body-xs" textTransform="uppercase" fontWeight="lg">
            {t('general.modulesSection')}
          </Typography>
          {hub.modules.length === 0 ? (
            <Typography level="body-sm">{t('general.noHubModules')}</Typography>
          ) : (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {hub.modules.map((mod) => (
                <OptionCard
                  key={mod.name}
                  size="sm"
                  title={mod.displayName || mod.name}
                  caption={`${t('general.cardKeyPrefix')}: ${mod.name}`}
                  action={
                    mod.imported ? (
                      <Tooltip title={t('general.moduleAlreadyImported')}>
                        <CheckIcon color="success" fontSize="small" />
                      </Tooltip>
                    ) : (
                      <Tooltip title={t('general.addModule')}>
                        <span>
                          <IconButton
                            size="sm"
                            variant="plain"
                            color="primary"
                            loading={importingModule === mod.name}
                            disabled={disabled || isUpdating()}
                            onClick={() => handleImportModule(mod)}
                            aria-label={t('general.addModule')}
                          >
                            <AddIcon />
                          </IconButton>
                        </span>
                      </Tooltip>
                    )
                  }
                />
              ))}
            </Stack>
          )}
        </Card>
      ))}

      {hubToDelete && (
        <HubDeleteModal
          open={modalOpen.deleteHub}
          onClose={() => {
            setHubToDelete(null);
            closeModal('deleteHub')();
          }}
          hubName={hubToDelete.displayName || hubToDelete.location}
          onDelete={() => handleDeleteHub(hubToDelete)}
          isDeleting={isUpdating(`delete-hub-${hubToDelete.location}`)}
        />
      )}
    </Stack>
  );
}

export default HubsSection;
