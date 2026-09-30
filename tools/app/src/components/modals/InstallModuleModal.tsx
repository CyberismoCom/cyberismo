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
  Alert,
  Button,
  CircularProgress,
  Divider,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Modal,
  ModalClose,
  ModalDialog,
  Option,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Typography,
} from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { useModuleVersions, useProjectSettingsMutations } from '@/lib/api';
import type { ProjectModule } from '@/lib/api/types';
import { useAppDispatch } from '@/lib/hooks';
import { addNotification } from '@/lib/slices/notifications';
import {
  bindingOf,
  bindingScope,
  newestMatching,
  rangeFor,
  selectableVersions,
  sourceHasCredentials,
  submitState,
  type Binding,
  type Listing,
} from '@/lib/modules';

interface InstallModuleModalProps {
  open: boolean;
  onClose: () => void;
  // Change-version mode: an installed root module, listed by its own source.
  module?: ProjectModule;
  // Prefilled and locked (a hub module's public location).
  source?: string;
  // Names the module in the title and the dialog's accessible name.
  label?: string;
  onDone?: () => Promise<void> | void;
}

/**
 * Installs a module or changes the version binding of an installed one. The
 * versions come from the module's git tags; the chosen version and binding
 * become the declared range.
 */
export function InstallModuleModal({
  open,
  onClose,
  module,
  source,
  label,
  onDone,
}: InstallModuleModalProps) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { addModule, updateModule } = useProjectSettingsMutations();
  const mode = module ? 'change' : 'install';
  const [sourceInput, setSourceInput] = useState(source ?? '');
  const [requested, setRequested] = useState<string | null>(source ?? null);
  const [selected, setSelected] = useState<string | null>(null);
  const [binding, setBinding] = useState<Binding>(
    bindingOf(module?.declaredRange),
  );
  const [submitting, setSubmitting] = useState(false);

  const trimmed = sourceInput.trim();
  const credentials = sourceHasCredentials(trimmed);
  const target = !open
    ? null
    : module
      ? { module: module.cardKeyPrefix }
      : requested && !sourceHasCredentials(requested)
        ? { source: requested }
        : null;
  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate: refetch,
  } = useModuleVersions(target);

  const stale = mode === 'install' && requested !== trimmed;
  const versions = selectableVersions(
    mode,
    data ?? [],
    module?.installedVersion,
  );
  const listing: Listing = !target
    ? 'idle'
    : stale
      ? 'stale'
      : isLoading || isValidating
        ? 'loading'
        : error
          ? 'error'
          : versions.length === 0
            ? 'empty'
            : 'versions';
  const version =
    selected && versions.includes(selected)
      ? selected
      : (versions.find((v) => !v.includes('-')) ?? versions[0]);
  const { canSubmit, range } = submitState({
    mode,
    source: trimmed,
    listing,
    version,
    binding,
  });

  const handleClose = () => {
    setSourceInput(source ?? '');
    setRequested(source ?? null);
    setSelected(null);
    setBinding(bindingOf(module?.declaredRange));
    onClose();
  };

  const listVersions = () => {
    if (!trimmed || credentials) return;
    setSelected(null);
    if (requested === trimmed) void refetch();
    else setRequested(trimmed);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      if (module) await updateModule(module.cardKeyPrefix, range);
      else await addModule(trimmed, range);
      handleClose();
      dispatch(
        addNotification({
          message: t(
            module
              ? 'installModuleModal.changeVersionSuccess'
              : 'installModuleModal.success',
          ),
          type: 'success',
        }),
      );
      await onDone?.();
    } catch (err) {
      dispatch(
        addNotification({
          message: err instanceof Error ? err.message : t('failedToLoad'),
          type: 'error',
        }),
      );
    }
    setSubmitting(false);
  };

  const title = module
    ? t('installModuleModal.titleChangeVersion', { module: module.name })
    : label
      ? t('installModuleModal.titleNamed', { module: label })
      : t('installModuleModal.title');
  const options: Binding[] = ['major', 'minor', 'exact'];

  return (
    <Modal
      open={open}
      onClose={() => (submitting ? null : handleClose())}
      disableEscapeKeyDown
    >
      <ModalDialog
        size="md"
        sx={{ width: { xs: '95vw', sm: 'auto' }, minWidth: { sm: 480 } }}
      >
        <ModalClose disabled={submitting} />
        <DialogTitle>{title}</DialogTitle>
        <Divider />
        {/* At fractional display scales sub-pixel rounding can overflow the
            content by less than a pixel, which shows as a scroll bar. */}
        <DialogContent sx={{ overflowX: 'hidden' }}>
          <Stack spacing={2}>
            {mode === 'install' && (
              <FormControl error={credentials}>
                <FormLabel>{t('installModuleModal.moduleUrl')} *</FormLabel>
                <Input
                  placeholder={t('installModuleModal.moduleUrlPlaceholder')}
                  value={sourceInput}
                  onChange={(e) => setSourceInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && listVersions()}
                  readOnly={Boolean(source)}
                  disabled={submitting}
                />
                {credentials && (
                  <FormHelperText>
                    {t('installModuleModal.credentialsRefused')}
                  </FormHelperText>
                )}
              </FormControl>
            )}
            {mode === 'install' && !source && (
              <Stack direction="row">
                <Button
                  size="sm"
                  variant="outlined"
                  onClick={listVersions}
                  loading={listing === 'loading'}
                  disabled={!trimmed || credentials || submitting}
                >
                  {t('installModuleModal.listVersions')}
                </Button>
              </Stack>
            )}
            {listing === 'loading' && (
              <Typography
                level="body-sm"
                role="status"
                startDecorator={<CircularProgress size="sm" />}
              >
                {t('installModuleModal.loadingVersions')}
              </Typography>
            )}
            {listing === 'error' && (
              <Alert
                color="danger"
                variant="soft"
                role="alert"
                endDecorator={
                  <Button
                    size="sm"
                    variant="outlined"
                    onClick={() => refetch()}
                  >
                    {t('installModuleModal.retry')}
                  </Button>
                }
              >
                <Stack>
                  <Typography level="title-sm">
                    {t('installModuleModal.listingFailed')}
                  </Typography>
                  <Typography level="body-sm">{error?.message}</Typography>
                </Stack>
              </Alert>
            )}
            {listing === 'empty' && (
              <Alert color="warning" variant="soft">
                {t(
                  mode === 'install'
                    ? 'installModuleModal.noVersions'
                    : 'installModuleModal.noNewerVersions',
                )}
              </Alert>
            )}
            {listing === 'versions' && version && (
              <>
                <FormControl>
                  <FormLabel>{t('installModuleModal.version')}</FormLabel>
                  <Select
                    value={version}
                    onChange={(_, value) => setSelected(value)}
                    disabled={submitting}
                  >
                    {versions.map((v) => (
                      <Option key={v} value={v}>
                        {v}
                      </Option>
                    ))}
                  </Select>
                  {module?.installedVersion && (
                    <FormHelperText>
                      {t('installModuleModal.upgradeOnly', {
                        version: module.installedVersion,
                      })}
                    </FormHelperText>
                  )}
                </FormControl>
                <FormControl>
                  <FormLabel>{t('installModuleModal.bindingLabel')}</FormLabel>
                  <RadioGroup
                    value={binding}
                    // Radio's action overlay extends 1px past the group; leave
                    // room so DialogContent doesn't clip it or scroll.
                    sx={{ px: '1px' }}
                    onChange={(e) => setBinding(e.target.value as Binding)}
                  >
                    {options.map((b) => (
                      <Radio
                        key={b}
                        value={b}
                        disabled={submitting}
                        label={t(`installModuleModal.binding.${b}`, {
                          scope: bindingScope(version, b),
                          range: rangeFor(version, b),
                        })}
                      />
                    ))}
                  </RadioGroup>
                  <FormHelperText>
                    {t('installModuleModal.declares', {
                      range,
                      version:
                        (range && newestMatching(versions, range)) ?? version,
                    })}
                  </FormHelperText>
                </FormControl>
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            variant="solid"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            loading={submitting}
          >
            {t(
              module
                ? 'installModuleModal.changeVersion'
                : 'installModuleModal.install',
            )}
          </Button>
          <Button
            variant="outlined"
            onClick={handleClose}
            disabled={submitting}
          >
            {t('installModuleModal.close')}
          </Button>
        </DialogActions>
      </ModalDialog>
    </Modal>
  );
}
